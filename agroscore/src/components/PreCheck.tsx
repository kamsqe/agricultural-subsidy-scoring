import { useState, useEffect, useMemo } from 'react';

interface DistrictInfo {
  count: number;
  avg_score: number;
  reject_rate: number;
  top1_share: number;
  median_amount: number;
}

interface SubsidyCode {
  name: string;
  count: number;
  avg_amount: number;
  median_amount: number;
}

interface ScoreResult {
  score: number;
  triage: string;
  percentile: number;
  components: Record<string, number>;
  exception: number;
  exceptionReasons: string[];
  tips: string[];
  counterfactuals: { label: string; delta: number }[];
}

const TRIAGE_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  A: { label: 'A — Высокий приоритет', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', desc: 'Рекомендован к финансированию' },
  B: { label: 'B — Стандартный', color: 'text-sky-400 bg-sky-500/10 border-sky-500/30', desc: 'Ожидание бюджета' },
  C: { label: 'C — Низкий приоритет', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', desc: 'Рекомендуется доработка' },
  D: { label: 'D — Отклонение вероятно', color: 'text-red-400 bg-red-500/10 border-red-500/30', desc: 'Высокий риск или низкий балл' },
};

function calculateScore(
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
  const monopolyScore = top1 > 0.7 ? 5 : top1 > 0.4 ? 15 : top1 > 0.2 ? 22 : 25;
  const medianRatio = dd ? amount / Math.max(dd.median_amount, 1) : 1;
  const medianScore = medianRatio <= 0.5 ? 25 : medianRatio <= 1.5 ? 22 : medianRatio <= 3 ? 15 : 5;
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
  const amountRatio = cd ? amount / Math.max(cd.median_amount, 1) : 1;
  const amountReasonableness = (amountRatio >= 0.3 && amountRatio <= 2) ? 25 : (amountRatio >= 0.1 && amountRatio <= 5) ? 15 : 5;
  const efficiency = historyScore + districtReputation + amountReasonableness;

  // === FRAUD RISK (0-100) ===
  let fraud = 0;
  if (amount > 0 && amount % 1_000_000 === 0) fraud += 15;
  else if (amount > 0 && amount % 100_000 === 0) fraud += 5;
  if (amountRatio > 10) fraud += 25;
  else if (amountRatio > 5) fraud += 15;
  else if (amountRatio > 3) fraud += 8;
  if (retryCount > 5) fraud += 20;
  else if (retryCount > 3) fraud += 12;
  else if (retryCount > 1) fraud += 5;
  if (top1 > 0.7) fraud += 15;
  else if (top1 > 0.4) fraud += 8;
  fraud = Math.min(fraud, 100);

  // === EXCEPTION POINTS (0-15) ===
  let exception = 0;
  const exceptionReasons: string[] = [];
  if (retryCount === 0) { exception += 5; exceptionReasons.push('Первая подача (+5)'); }
  if (amount < 5_000_000 && top1 > 0.4) { exception += 5; exceptionReasons.push('Мелкий фермер в монополизированном районе (+5)'); }
  exception = Math.min(exception, 15);

  // === FINAL SCORE ===
  const base = 0.20 * strategic + 0.20 * fairness + 0.20 * need + 0.20 * efficiency + 0.10 * 50;
  const penalty = 0.10 * fraud;
  const score = Math.min(100, Math.max(0, Math.round((base - penalty + exception) * 10) / 10));

  const triage = score >= 65 ? 'A' : score >= 55 ? 'B' : score >= 40 ? 'C' : 'D';

  // Percentile from real score distribution
  const belowCount = allScores.filter(s => s < score).length;
  const percentile = Math.round((belowCount / allScores.length) * 100);

  // === TIPS ===
  const tips: string[] = [];
  if (!isBreeding) tips.push('Переход на племенное направление (коды 003xx, 004xx) даёт +15 к Strategic');
  if (amount > 20_000_000) tips.push('Сумма >20 млн снижает Fairness. Рассмотрите разбивку заявки');
  if (retryCount > 3) tips.push('Более 3 повторных подач снижает Efficiency (−13) и повышает Fraud Risk (+12)');
  if (amount > 0 && amount % 1_000_000 === 0) tips.push('Круглая сумма (кратна 1 млн) добавляет +15 к Fraud Risk');
  if (fraud === 0) tips.push('Нет fraud-аномалий');
  if (sizeScore >= 22) tips.push('Небольшая сумма даёт бонус к Fairness');
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

function ComponentBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-20 text-right">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-3 relative">
        <div className={`${color} h-3 rounded-full`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-300 w-10 text-right">{value.toFixed(0)}</span>
    </div>
  );
}

export default function PreCheck() {
  const [oblastMap, setOblastMap] = useState<Record<string, string[]>>({});
  const [districtData, setDistrictData] = useState<Record<string, DistrictInfo>>({});
  const [codeData, setCodeData] = useState<Record<string, SubsidyCode>>({});
  const [allScores, setAllScores] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const [oblast, setOblast] = useState('');
  const [district, setDistrict] = useState('');
  const [subsidyCode, setSubsidyCode] = useState('');
  const [volume, setVolume] = useState(10);
  const [amount, setAmount] = useState(3000000);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState<ScoreResult | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/data/oblast_districts.json').then(r => r.json()),
      fetch('/data/districts.json').then(r => r.json()),
      fetch('/data/subsidy_codes.json').then(r => r.json()),
      fetch('/data/scoring_summary.json').then(r => r.json()),
    ]).then(([oblasts, districts, codes, summary]) => {
      setOblastMap(oblasts);
      setDistrictData(districts);
      setCodeData(codes);
      // Build approximate score CDF from histogram
      const hist = summary.score_distribution as Record<string, number>;
      const approxScores: number[] = [];
      for (const [bucket, count] of Object.entries(hist)) {
        const b = parseInt(bucket);
        for (let i = 0; i < (count as number); i++) approxScores.push(b + 5);
      }
      setAllScores(approxScores);

      const firstOblast = Object.keys(oblasts).sort()[0];
      setOblast(firstOblast);
      setDistrict(oblasts[firstOblast]?.[0] || '');
      setSubsidyCode(Object.keys(codes).sort()[0]);
      setLoading(false);
    });
  }, []);

  const oblastList = useMemo(() => Object.keys(oblastMap).sort(), [oblastMap]);
  const districtList = useMemo(() => (oblastMap[oblast] || []).sort(), [oblastMap, oblast]);
  const codeList = useMemo(() =>
    Object.entries(codeData)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([code, info]) => ({ code, label: `${code} — ${info.name.slice(0, 50)}`, count: info.count })),
    [codeData]
  );

  const handleOblastChange = (o: string) => {
    setOblast(o);
    setDistrict((oblastMap[o] || [])[0] || '');
    setResult(null);
  };

  const handleCodeChange = (code: string) => {
    setSubsidyCode(code);
    const cd = codeData[code];
    if (cd) setAmount(cd.median_amount);
    setResult(null);
  };

  const handleCalculate = () => {
    if (!district || !subsidyCode) return;
    setResult(calculateScore(district, subsidyCode, volume, amount, retryCount, districtData, codeData, allScores));
  };

  if (loading) return <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-400">Загрузка данных Pre-Check...</div>;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 mb-8">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-lg font-semibold">Pre-Check: Проверь свою заявку</h3>
          <p className="text-slate-400 text-sm">Заполните форму как в ГИСС — получите предварительный балл и рекомендации</p>
        </div>
        <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded">Зеркало ГИСС</span>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-5 mb-5">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Область</label>
          <select value={oblast} onChange={e => handleOblastChange(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
            {oblastList.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Район</label>
          <select value={district} onChange={e => { setDistrict(e.target.value); setResult(null); }} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
            {districtList.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {districtData[district] && (
            <div className="text-[10px] text-slate-500 mt-1">
              {districtData[district].count} заявок | ср. балл {districtData[district].avg_score} | отказы {(districtData[district].reject_rate * 100).toFixed(1)}%
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Тип субсидии</label>
          <select value={subsidyCode} onChange={e => handleCodeChange(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
            {codeList.map(c => <option key={c.code} value={c.code}>{c.label} ({c.count})</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Количество голов / объём</label>
          <input type="number" value={volume} onChange={e => setVolume(Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" min={1} />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Сумма заявки (₸)</label>
          <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" min={0} step={100000} />
          {codeData[subsidyCode] && (
            <div className="text-[10px] text-slate-500 mt-1">
              Медианная сумма по этому типу: {(codeData[subsidyCode].median_amount / 1e6).toFixed(1)} млн ₸
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Повторных подач ранее</label>
          <input type="number" value={retryCount} onChange={e => setRetryCount(Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" min={0} max={20} />
        </div>
      </div>

      <button onClick={handleCalculate} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg transition mb-5">
        Рассчитать Impact Score
      </button>

      {result && (
        <div className="space-y-4">
          {/* Score + Triage + Percentile */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center py-4 bg-slate-800/50 rounded-xl">
              <div className={`text-5xl font-bold ${result.score >= 65 ? 'text-emerald-400' : result.score >= 55 ? 'text-sky-400' : result.score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                {result.score}
              </div>
              <div className="text-slate-400 text-sm mt-1">Impact Score</div>
            </div>
            <div className="flex flex-col items-center justify-center py-4 bg-slate-800/50 rounded-xl">
              <div className={`text-sm font-medium px-3 py-1 rounded border ${TRIAGE_LABELS[result.triage]?.color}`}>
                {TRIAGE_LABELS[result.triage]?.label}
              </div>
              <div className="text-slate-500 text-xs mt-2">{TRIAGE_LABELS[result.triage]?.desc}</div>
            </div>
            <div className="text-center py-4 bg-slate-800/50 rounded-xl">
              <div className="text-3xl font-bold text-white">{result.percentile}<span className="text-lg text-slate-500">%</span></div>
              <div className="text-slate-400 text-sm mt-1">Лучше чем {result.percentile}% заявок</div>
            </div>
          </div>

          {/* Components */}
          <div className="space-y-2">
            <ComponentBar label="Strategic" value={result.components.strategic} color="bg-sky-500" />
            <ComponentBar label="Fairness" value={result.components.fairness} color="bg-violet-500" />
            <ComponentBar label="Need" value={result.components.need} color="bg-amber-500" />
            <ComponentBar label="Efficiency" value={result.components.efficiency} color="bg-emerald-500" />
            <ComponentBar label="Fraud Risk" value={result.components.fraud} color="bg-red-500" />
            {result.exception > 0 && <ComponentBar label="Exception" value={result.exception} max={15} color="bg-yellow-500" />}
          </div>

          {/* Exception reasons */}
          {result.exceptionReasons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.exceptionReasons.map((r, i) => (
                <span key={i} className="text-xs bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded">{r}</span>
              ))}
            </div>
          )}

          {/* Counterfactuals */}
          {result.counterfactuals.length > 0 && (
            <div className="bg-slate-800/30 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-2 font-medium">Контрафактуальный анализ (что если?)</div>
              <div className="space-y-1.5">
                {result.counterfactuals.map((cf, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-slate-300">{cf.label}</span>
                    <span className={cf.delta > 0 ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                      {cf.delta > 0 ? '+' : ''}{cf.delta}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-slate-800/30 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-2 font-medium">Рекомендации</div>
            <div className="space-y-1.5">
              {result.tips.map((tip, i) => (
                <div key={i} className="text-sm text-slate-300">{tip}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
