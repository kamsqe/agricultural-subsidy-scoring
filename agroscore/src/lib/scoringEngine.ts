export interface DistrictInfo {
  count: number;
  avg_score: number;
  reject_rate: number;
  top1_share: number;
  median_amount: number;
  // Enriched fields from pipeline (aligned with Python score.py)
  backlog_ratio?: number;
  approval_rate?: number;
  budget_per_applicant?: number;
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

// Priority codes aligned with Python PRIORITY_CODES
const PRIORITY_CODES = new Set(['01300', '01200', '02000', '04500']);

// Food security tiers aligned with Python FOOD_SECURITY dict
const FOOD_SECURITY: Record<string, number> = {
  poultry: 1.0, dairy: 0.8, cattle: 0.7, sheep: 0.6,
  horses: 0.5, camels: 0.5, pigs: 0.4, meat: 0.7, other: 0.3,
};

// Map subsidy code prefixes to livestock direction
function guessDirection(code: string): string {
  if (code.startsWith('059')) return 'poultry';
  if (code.startsWith('058') || code.startsWith('013')) return 'dairy';
  if (code.startsWith('007') || code.startsWith('003') || code.startsWith('004')) return 'cattle';
  if (code.startsWith('014')) return 'sheep';
  if (code.startsWith('012')) return 'horses';
  if (code.startsWith('020')) return 'camels';
  return 'other';
}

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
  // Aligned with Python: priority_score + food_security_score + spec_score
  const isPriority = PRIORITY_CODES.has(subsidyCode);
  const priorityScore = isPriority ? 30 : 15;
  const direction = guessDirection(subsidyCode);
  const fsPriority = FOOD_SECURITY[direction] ?? 0.3;
  const foodSecurityScore = fsPriority * 30;
  // spec_score: without stat.gov.kz regional data, use neutral 15 (same as Python fallback)
  const specScore = 15;
  const strategic = Math.min(100, Math.round(specScore + priorityScore + foodSecurityScore));

  // === FAIRNESS (0-100) ===
  // Aligned with Python: monopoly_score + median_score + small_bonus
  const top1 = dd ? dd.top1_share : 0.3;
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
  // Aligned with Python: backlog_score + approval_score + budget_score + seasonal_score
  // Uses enriched district data from pipeline
  const backlogRatio = dd?.backlog_ratio ?? 0;
  const backlogScore = backlogRatio > 0.4 ? 30 : backlogRatio > 0.2 ? 22 : backlogRatio > 0.1 ? 15 : 8;

  const approvalRate = dd?.approval_rate ?? 0;
  const approvalScore = approvalRate > 0 ? (1 - approvalRate) * 25 : 12;

  const budgetPerApp = dd?.budget_per_applicant ?? 0;
  let budgetScore = 12;
  if (budgetPerApp > 0) {
    if (budgetPerApp < 15_000_000) budgetScore = 25;
    else if (budgetPerApp < 30_000_000) budgetScore = 18;
    else if (budgetPerApp < 50_000_000) budgetScore = 12;
    else budgetScore = 5;
  }

  // Seasonal: use neutral 0.7 (no month in PreCheck — honest limitation)
  const seasonalScore = 0.7 * 20;
  const need = Math.round(backlogScore + approvalScore + budgetScore + seasonalScore);

  // === EFFICIENCY (0-100) ===
  // Aligned with Python: same logic
  let historyScore = 30;
  if (retryCount === 0) historyScore = 30;
  else if (retryCount === 1) historyScore = 35;
  else if (retryCount <= 3) historyScore = 22;
  else historyScore = 10;
  const districtReputation = dd ? (1 - Math.min(dd.reject_rate, 1)) * 40 : 32;
  const amtTypeRatio = cd ? amount / Math.max(cd.median_amount, 1) : 1;
  const amountReasonableness = (amtTypeRatio >= 0.3 && amtTypeRatio <= 2) ? 25 : (amtTypeRatio >= 0.1 && amtTypeRatio <= 5) ? 15 : 5;
  const efficiency = Math.round(historyScore + districtReputation + amountReasonableness);

  // === FRAUD RISK (0-100) ===
  // Aligned with Python (minus ML anomaly & late-night — not available in PreCheck)
  let fraud = 0;
  // Norm-derived amount exemption: if code has a norm, check if amount ≈ volume × norm
  const isNormDerived = cd && cd.norm > 0 && volume > 0 && Math.abs(amount - volume * cd.norm) < volume * cd.norm * 0.1;
  if (!isNormDerived) {
    if (amount > 0 && amount % 1_000_000 === 0) fraud += 15;
    else if (amount > 0 && amount % 100_000 === 0) fraud += 5;
  }
  if (volRatio > 10) fraud += 25;
  else if (volRatio > 5) fraud += 15;
  else if (volRatio > 3) fraud += 8;
  if (retryCount > 5) fraud += 20;
  else if (retryCount > 3) fraud += 12;
  else if (retryCount > 1) fraud += 5;
  if (top1 > 0.7) fraud += 15;
  else if (top1 > 0.4) fraud += 8;
  // NOTE: ML anomaly score and late-night check not available in PreCheck
  fraud = Math.min(fraud, 100);

  // === EXCEPTION POINTS (0-15) ===
  // Aligned with Python: 3 rules
  let exception = 0;
  const exceptionReasons: string[] = [];
  const rejectRate = dd ? dd.reject_rate : 0.08;
  if (retryCount === 0 && rejectRate > 0.15) { exception += 3; exceptionReasons.push('Первая подача в районе с высоким % отказов (+3)'); }
  if (backlogRatio > 0.30) { exception += 5; exceptionReasons.push('Область с высоким бэклогом заявок (+5)'); }
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
  if (!isPriority) tips.push('Приоритетные коды субсидий (01300, 01200, 02000, 04500) дают +15 к Strategic');
  if (fsPriority < 0.7) tips.push(`Направление "${direction}" имеет низкий приоритет продбезопасности (${(fsPriority * 100).toFixed(0)}%). Молоко/птица — выше`);
  if (amount > 20_000_000) tips.push('Сумма >20 млн снижает Fairness. Рассмотрите разбивку заявки');
  if (retryCount > 3) tips.push('Более 3 повторных подач снижает Efficiency (−13) и повышает Fraud Risk (+12)');
  if (!isNormDerived && amount > 0 && amount % 1_000_000 === 0) tips.push('Круглая сумма (кратна 1 млн) добавляет +15 к Fraud Risk. Используйте нормативную формулу');
  if (fraud === 0) tips.push('Нет fraud-аномалий');
  if (sizeScore >= 22) tips.push('Небольшая сумма даёт бонус к Fairness');
  if (volRatio > 3) tips.push(`Объём (${volume} голов) в ${volRatio.toFixed(1)}x выше медианы для этого типа субсидии — повышает Fraud Risk`);
  else if (volRatio < 0.5 && volRatio > 0) tips.push(`Объём (${volume} голов) ниже половины медианы для этого типа — бонус к Fairness`);
  if (dd && rejectRate > 0.15) tips.push(`Район ${district} имеет высокий % отказов (${(rejectRate * 100).toFixed(0)}%), что увеличивает Regional Need`);
  tips.push('⚠️ PreCheck использует упрощённую формулу (без ML-аномалий и времени подачи). Фактический Pipeline-балл может отличаться.');

  // === COUNTERFACTUALS ===
  const counterfactuals: { label: string; delta: number }[] = [];
  if (!isPriority) {
    const altStrategic = Math.min(100, Math.round(specScore + 30 + 0.8 * 30));
    const altBase = 0.20 * altStrategic + 0.20 * fairness + 0.20 * need + 0.20 * efficiency + 0.10 * 50;
    const altScore = Math.min(100, Math.max(0, altBase - penalty + exception));
    counterfactuals.push({ label: 'Если бы приоритетный код субсидии', delta: Math.round((altScore - score) * 10) / 10 });
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
