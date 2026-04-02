export interface DistrictInfo {
  count: number;
  avg_score: number;
  reject_rate: number;
  top1_share: number;
  median_amount: number;
}

export interface SubsidyCode {
  name: string;
  norm: number;
  count: number;
  avg_amount: number;
  median_amount: number;
  median_volume: number;
}

export interface ScoreResult {
  score: number;
  triage: string;
  percentile: number;
  components: Record<string, number>;
  exception: number;
  exceptionReasons: string[];
  tips: string[];
  counterfactuals: { label: string; delta: number }[];
}

export const TRIAGE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  A: { label: 'A — Высокий приоритет', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', desc: 'Рекомендован к финансированию' },
  B: { label: 'B — Стандартный', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30', desc: 'Ожидание бюджета' },
  C: { label: 'C — Низкий приоритет', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', desc: 'Рекомендуется доработка' },
  D: { label: 'D — Отклонение вероятно', color: 'text-red-400 bg-red-500/10 border-red-500/30', desc: 'Высокий риск или низкий балл' },
};

export function calculateScore(
  district: string,
  subsidyCode: string,
  volume: number,
  amount: number,
  retryCount: number,
  districtData: Record<string, DistrictInfo>,
  codeData: Record<string, SubsidyCode>,
  allScores: number[],
): ScoreResult {
  const dd = districtData[district];
  const cd = codeData[subsidyCode];

  // === STRATEGIC ALIGNMENT (0-100) ===
  const isBreeding = subsidyCode.startsWith('003') || subsidyCode.startsWith('004') || subsidyCode.startsWith('013');
  const priorityBonus = isBreeding ? 30 : 15;
  const foodSecurityScore = isBreeding ? 25 : 15;
  const specScore = 20;
  const strategic = Math.min(100, specScore + priorityBonus + foodSecurityScore);

  // === FAIRNESS (0-100) ===
  const top1 = dd ? dd.top1_share : 0.3;
  // Use volume vs type median (not broken cross-type amount_vs_median)
  const volRatio = cd && cd.median_volume > 0 ? volume / cd.median_volume : 1;
  const monopolyScore = top1 > 0.5
    ? (volRatio < 1.5 ? 35 : 10)
    : top1 > 0.2 ? 25 : 20;
  const medianScore = volRatio <= 0.5 ? 25 : volRatio <= 1.5 ? 30 : volRatio <= 3 ? 20 : 10;
  let sizeScore = 30;
  if (amount < 1_000_000) sizeScore = 30;
  else if (amount < 5_000_000) sizeScore = 22;
  else if (amount < 20_000_000) sizeScore = 12;
  else sizeScore = 5;
  const fairness = monopolyScore + medianScore + sizeScore;

  // === REGIONAL NEED (0-100) ===
  const avgDistrictScore = dd ? dd.avg_score : 60;
  const rejectRate = dd ? dd.reject_rate : 0.08;
  const needFromRejectRate = rejectRate > 0.15 ? 20 : rejectRate > 0.08 ? 14 : 8;
  const needFromAvgScore = avgDistrictScore < 55 ? 20 : avgDistrictScore < 60 ? 14 : 8;
  const need = needFromRejectRate + needFromAvgScore + 18 + 12;

  // === EFFICIENCY (0-100) ===
  let historyScore = 30;
  if (retryCount === 0) historyScore = 30;
  else if (retryCount === 1) historyScore = 35;
  else if (retryCount <= 3) historyScore = 22;
  else historyScore = 10;
  const districtReputation = dd ? (1 - Math.min(dd.reject_rate, 1)) * 40 : 32;
  const amtTypeRatio = cd ? amount / Math.max(cd.median_amount, 1) : 1;
  const amountReasonableness = (amtTypeRatio >= 0.3 && amtTypeRatio <= 2) ? 25 : (amtTypeRatio >= 0.1 && amtTypeRatio <= 5) ? 15 : 5;
  const efficiency = historyScore + districtReputation + amountReasonableness;

  // === FRAUD RISK (0-100) ===
  let fraud = 0;
  if (amount > 0 && amount % 1_000_000 === 0) fraud += 15;
  else if (amount > 0 && amount % 100_000 === 0) fraud += 5;
  // Use volume vs type median for outlier detection (not cross-type amount)
  if (volRatio > 10) fraud += 25;
  else if (volRatio > 5) fraud += 15;
  else if (volRatio > 3) fraud += 8;
  if (retryCount > 5) fraud += 20;
  else if (retryCount > 3) fraud += 12;
  else if (retryCount > 1) fraud += 5;
  if (top1 > 0.7) fraud += 15;
  else if (top1 > 0.4) fraud += 8;
  fraud = Math.min(fraud, 100);

  // === EXCEPTION POINTS (0-15) ===
  let exception = 0;
  const exceptionReasons: string[] = [];
  if (retryCount === 0 && rejectRate > 0.15) { exception += 3; exceptionReasons.push('Первая подача в районе с высоким % отказов (+3)'); }
  if (amount < 5_000_000 && top1 > 0.4) { exception += 5; exceptionReasons.push('Мелкий фермер в монополизированном районе (+5)'); }
  exception = Math.min(exception, 15);

  // === FINAL SCORE ===
  const base = 0.20 * strategic + 0.20 * fairness + 0.20 * need + 0.20 * efficiency + 0.10 * 50;
  const penalty = 0.10 * fraud;
  const score = Math.min(100, Math.max(0, Math.round((base - penalty + exception) * 10) / 10));

  const triage = score >= 65 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';

  // Percentile from real score distribution
  const belowCount = allScores.filter(s => s < score).length;
  const percentile = allScores.length > 0 ? Math.round((belowCount / allScores.length) * 100) : 50;

  // === TIPS ===
  const tips: string[] = [];
  if (!isBreeding) tips.push('Переход на племенное направление (коды 003xx, 004xx) даёт +15 к Strategic');
  if (amount > 20_000_000) tips.push('Сумма >20 млн снижает Fairness. Рассмотрите разбивку заявки');
  if (retryCount > 3) tips.push('Более 3 повторных подач снижает Efficiency (−13) и повышает Fraud Risk (+12)');
  if (amount > 0 && amount % 1_000_000 === 0) tips.push('Круглая сумма (кратна 1 млн) добавляет +15 к Fraud Risk');
  if (fraud === 0) tips.push('Нет fraud-аномалий');
  if (sizeScore >= 22) tips.push('Небольшая сумма даёт бонус к Fairness');
  if (volRatio > 3) tips.push(`Объём (${volume} голов) в ${(volRatio).toFixed(1)}x выше медианы для этого типа субсидии — повышает Fraud Risk`);
  else if (volRatio < 0.5 && volRatio > 0) tips.push(`Объём (${volume} голов) ниже половины медианы для этого типа — бонус к Fairness`);
  if (dd && dd.reject_rate > 0.15) tips.push(`Район ${district} имеет высокий % отказов (${(dd.reject_rate * 100).toFixed(0)}%), что увеличивает Regional Need`);

  // === COUNTERFACTUALS ===
  const counterfactuals: { label: string; delta: number }[] = [];
  if (!isBreeding) {
    const altStrategic = Math.min(100, specScore + 30 + 25);
    const altBase = 0.20 * altStrategic + 0.20 * fairness + 0.20 * need + 0.20 * efficiency + 0.10 * 50;
    const altScore = Math.min(100, Math.max(0, altBase - penalty + exception));
    counterfactuals.push({ label: 'Если бы племенное направление', delta: Math.round((altScore - score) * 10) / 10 });
  }
  if (amount > 5_000_000) {
    const smallAmount = 3_000_000;
    const altSizeScore = 22;
    const altFairness = monopolyScore + medianScore + altSizeScore;
    const altBase = 0.20 * strategic + 0.20 * altFairness + 0.20 * need + 0.20 * efficiency + 0.10 * 50;
    let altFraud = fraud;
    if (smallAmount % 1_000_000 === 0) altFraud = Math.max(0, altFraud);
    const altScore = Math.min(100, Math.max(0, altBase - 0.10 * altFraud + exception + 5));
    counterfactuals.push({ label: 'Если бы сумма 3 млн (мелкий фермер)', delta: Math.round((altScore - score) * 10) / 10 });
  }
  if (retryCount > 1) {
    const altHistory = 30;
    const altEfficiency = altHistory + districtReputation + amountReasonableness;
    const altBase = 0.20 * strategic + 0.20 * fairness + 0.20 * need + 0.20 * altEfficiency + 0.10 * 50;
    const altException = exception + (retryCount > 0 ? 5 : 0);
    const altFraud = Math.max(0, fraud - (retryCount > 5 ? 20 : retryCount > 3 ? 12 : 5));
    const altScore = Math.min(100, Math.max(0, altBase - 0.10 * altFraud + Math.min(altException, 15)));
    counterfactuals.push({ label: 'Если бы первая подача', delta: Math.round((altScore - score) * 10) / 10 });
  }

  return {
    score, triage, percentile,
    components: { strategic, fairness, need, efficiency, fraud, exception },
    exception, exceptionReasons, tips, counterfactuals,
  };
}
