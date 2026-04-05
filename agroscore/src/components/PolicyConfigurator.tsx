import { useState } from 'react';
import type { App } from './AppTable';

// Policy weight multipliers that the minister can adjust
interface PolicyWeights {
  strategicWeight: number;  // default 0.20
  fairnessWeight: number;   // default 0.20
  fraudWeight: number;      // default 0.10
}

// Simplified component re-scoring using the real component scores from pipeline
// This uses the same 5-component formula: w_s*S + w_f*F + w_n*N + w_e*E + w_base*50 - w_fr*FR
function rescoreApp(app: App, weights: PolicyWeights): number {
  // Real component scores from pipeline (stored in all_apps.json)
  const S = app.st ?? 50;   // strategic
  const F = app.fa ?? 50;   // fairness
  const N = app.ne ?? 50;   // need
  const E = app.ef ?? 50;   // efficiency
  const FR = app.fr ?? 0;   // fraud risk

  // Remaining weight goes to Need + Efficiency equally
  const remainingW = Math.max(0, 1 - weights.strategicWeight - weights.fairnessWeight - 0.10 - weights.fraudWeight);
  const needWeight = remainingW / 2;
  const effWeight = remainingW / 2;

  const base = weights.strategicWeight * S + weights.fairnessWeight * F + needWeight * N + effWeight * E + 0.10 * 50;
  const penalty = weights.fraudWeight * FR;
  return Math.min(100, Math.max(0, Math.round((base - penalty) * 10) / 10));
}

export default function PolicyConfigurator() {
  const [strategicW, setStrategicW] = useState(20);  // % of 100
  const [fairnessW, setFairnessW] = useState(20);
  const [fraudW, setFraudW] = useState(10);
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<{ approved: number; rejected: number; avgScore: number } | null>(null);

  const totalCount = 36651;

  const handleRecalculate = async () => {
    setIsCalculating(true);
    setResult(null);

    // Small delay so user sees loading state
    await new Promise(res => setTimeout(res, 100));

    try {
      const resp = await fetch('/data/all_apps.json');
      const apps: App[] = await resp.json();

      const weights: PolicyWeights = {
        strategicWeight: strategicW / 100,
        fairnessWeight: fairnessW / 100,
        fraudWeight: fraudW / 100,
      };

      // Re-score all apps using real component values with adjusted weights
      const rescored = apps.map(app => ({
        ...app,
        newScore: rescoreApp(app, weights),
      }));

      // Sort descending by new score
      rescored.sort((a, b) => b.newScore - a.newScore);

      // Triage / Allocate under 50B KZT budget
      const BUDGET_LIMIT = 50_000_000_000;
      let cumulative = 0;
      let approved = 0;

      for (const app of rescored) {
        cumulative += app.amt;
        if (cumulative <= BUDGET_LIMIT) approved++;
        else break;
      }

      const avgScore = rescored.reduce((sum, a) => sum + a.newScore, 0) / rescored.length;

      setResult({
        approved,
        rejected: totalCount - approved,
        avgScore: Math.round(avgScore * 10) / 10,
      });
    } catch (e) {
      console.error(e);
    }

    setIsCalculating(false);
  };

  const approvedCount = result?.approved ?? 13245;
  const rejectedCount = result?.rejected ?? 23406;

  return (
    <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl h-full flex flex-col">
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />
      
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="text-xl">⚙️</span> Панель Министра (Policy Weights)
        </h3>
        <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-700/30 text-emerald-400 border border-emerald-500/30 uppercase tracking-widest hidden sm:block">Реальная Формула</span>
      </div>
      
      <p className="text-slate-400 text-sm mb-8 leading-relaxed relative z-10">
        Изменяя веса 5-компонентной формулы Impact Score, вы перестраиваете приоритеты для <b>36 651</b> заявок. Используются реальные компоненты из pipeline (S, F, N, E, FR).
      </p>

      <div className="space-y-8 flex-1 relative z-10">
        {/* Slider 1: Strategic Weight */}
        <div className="bg-[#0b121a] p-4 rounded-xl border border-slate-800/80 shadow-inner">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-bold text-slate-200">Вес Strategic Alignment</label>
            <span className="text-sky-400 font-mono font-bold bg-sky-500/10 px-2 py-0.5 rounded">{strategicW}%</span>
          </div>
          <input
            type="range" min={5} max={40} step={5}
            value={strategicW}
            onChange={(e) => setStrategicW(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-sky-400 transition-colors"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
            <span>5%</span>
            <span>По умолчанию: 20%</span>
            <span>40%</span>
          </div>
        </div>

        {/* Slider 2: Fairness Weight */}
        <div className="bg-[#0b121a] p-4 rounded-xl border border-slate-800/80 shadow-inner">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-bold text-slate-200">Вес Fairness (Антимонополия)</label>
            <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded">{fairnessW}%</span>
          </div>
          <input
            type="range" min={5} max={40} step={5}
            value={fairnessW}
            onChange={(e) => setFairnessW(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-colors"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
            <span>5%</span>
            <span>По умолчанию: 20%</span>
            <span>40%</span>
          </div>
        </div>

        {/* Slider 3: Fraud Weight */}
        <div className="bg-[#0b121a] p-4 rounded-xl border border-slate-800/80 shadow-inner">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-bold text-slate-200">Вес Fraud Risk (Наказание)</label>
            <span className="text-red-400 font-mono font-bold bg-red-500/10 px-2 py-0.5 rounded">{fraudW}%</span>
          </div>
          <input
            type="range" min={0} max={30} step={5}
            value={fraudW}
            onChange={(e) => setFraudW(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400 transition-colors"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
            <span>0%</span>
            <span>По умолчанию: 10%</span>
            <span>30%</span>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between items-center relative z-10">
        <div className="text-xs text-slate-500">
          Score = {strategicW}%·S + {fairnessW}%·F + {Math.round((100 - strategicW - fairnessW - 10 - fraudW) / 2)}%·N + {Math.round((100 - strategicW - fairnessW - 10 - fraudW) / 2)}%·E + 10%·50 − {fraudW}%·FR
        </div>
        <button 
          onClick={handleRecalculate}
          disabled={isCalculating}
          className={`px-4 py-2 text-sm font-bold rounded transition-colors shadow-[0_0_15px_rgba(16,185,129,0.4)] flex items-center gap-2 relative ${
            isCalculating ? 'bg-slate-700 text-slate-400 cursor-not-allowed shadow-none' 
            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
          }`}
        >
          {isCalculating && (
            <svg className="animate-spin h-4 w-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {isCalculating ? 'Пересчет 36K заявок...' : result ? `✓ Пересчитано (Ø ${result.avgScore})` : 'Смоделировать Эффект'}
        </button>
      </div>
      
      {/* Metric Visualizer */}
      <div className="mt-4 flex h-1.5 w-full bg-red-900/30 rounded-full overflow-hidden border border-slate-800">
         <div 
           className="bg-emerald-500 h-full transition-all duration-1000 ease-in-out relative"
           style={{ width: `${(approvedCount / totalCount) * 100}%` }}
         >
            <div className="absolute inset-0 bg-white/20 w-full animate-[pulse_2s_infinite]"></div>
         </div>
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono uppercase tracking-widest">
         <span>Одобрено пулом: {approvedCount.toLocaleString()} (Бюджет 50 млрд ₸)</span>
         <span>Ждут в резерве: {rejectedCount.toLocaleString()}</span>
      </div>
    </div>
  );
}
