import { useState, useEffect, useMemo } from 'react';
import { calculateScore, TRIAGE_LABELS, type DistrictInfo, type SubsidyCode, type ScoreResult } from '../lib/scoringEngine';

interface RejectionCategory {
  count: number;
  pct: number;
  examples: string[];
}

interface RejectionCodeData {
  name: string;
  total_applications: number;
  rejected: number;
  approved: number;
  rejection_rate_pct: number;
  reasons_analyzed: number;
  categories: Record<string, RejectionCategory>;
  top_risk_oblasts: Record<string, { total: number; rejected: number; rejection_rate: number }>;
  advice: string[];
}

interface RejectionData {
  meta: {
    total_records: number;
    total_rejected: number;
    total_with_reasons: number;
    categories: Record<string, { label_ru: string; label_en: string; advice_ru: string }>;
  };
  by_subsidy_code: Record<string, RejectionCodeData>;
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
  const [rejectionData, setRejectionData] = useState<RejectionData | null>(null);
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
      fetch('/data/rejection_reasons.json').then(r => r.json()).catch(() => null),
    ]).then(([oblasts, districts, codes, summary, rejections]) => {
      setOblastMap(oblasts);
      setDistrictData(districts);
      setCodeData(codes);
      if (rejections) setRejectionData(rejections);
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
    if (cd) {
      setVolume(cd.median_volume);
      setAmount(cd.median_volume * cd.norm);
    }
    setResult(null);
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    const cd = codeData[subsidyCode];
    if (cd && cd.norm > 0) setAmount(v * cd.norm);
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
          <input type="number" value={volume} onChange={e => handleVolumeChange(Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" min={1} />
          {codeData[subsidyCode] && (
            <div className="text-[10px] text-slate-500 mt-1">
              Медиана: {codeData[subsidyCode].median_volume} гол. | Ставка: {codeData[subsidyCode].norm.toLocaleString()} ₸/гол.
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Сумма заявки (₸) <span className="text-slate-600">= объём × ставка</span></label>
          <input type="number" value={amount} readOnly className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-400 cursor-not-allowed" />
          {codeData[subsidyCode] && (
            <div className="text-[10px] text-slate-500 mt-1">
              {volume} × {codeData[subsidyCode].norm.toLocaleString()} ₸ = {(amount / 1e6).toFixed(2)} млн ₸
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Повторных подач ранее</label>
          <input type="number" value={retryCount} onChange={e => setRetryCount(Number(e.target.value))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" min={0} max={20} />
        </div>
      </div>

      {/* Rejection Risk Panel — shown when subsidy type is selected */}
      {rejectionData && subsidyCode && rejectionData.by_subsidy_code[subsidyCode] && (() => {
        const rd = rejectionData.by_subsidy_code[subsidyCode];
        const catMeta = rejectionData.meta.categories;
        const sortedCats = Object.entries(rd.categories)
          .filter(([id]) => id !== 'other')
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 5);
        return rd.reasons_analyzed > 0 ? (
          <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-sm">⚠</span>
                <span className="text-sm font-medium text-red-300">Риск отказа по данным 2021-2024</span>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {rd.rejection_rate_pct}% отказов | {rd.reasons_analyzed} причин проанализировано
              </span>
            </div>
            {/* Category bars */}
            <div className="space-y-2 mb-3">
              {sortedCats.map(([catId, cat]) => {
                const label = catMeta[catId]?.label_ru || catId;
                return (
                  <div key={catId} className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-48 text-right truncate" title={label}>{label}</span>
                    <div className="flex-1 bg-slate-800 rounded-full h-2.5 relative">
                      <div className="bg-red-500/60 h-2.5 rounded-full" style={{ width: `${cat.pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-slate-400 w-12 text-right">{cat.pct}%</span>
                  </div>
                );
              })}
            </div>
            {/* Checklist */}
            {rd.advice.length > 0 && (
              <div className="border-t border-red-500/10 pt-3 mt-3">
                <div className="text-xs text-slate-400 mb-2 font-medium">Чеклист перед подачей:</div>
                <div className="space-y-1">
                  {rd.advice.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                      <span className="text-slate-600 mt-0.5">☐</span>
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="text-[10px] text-slate-600 mt-3">
              Источник: subsidy.plem.kz — {rd.total_applications.toLocaleString()} заявок за 2021-2024
            </div>
          </div>
        ) : null;
      })()}

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
