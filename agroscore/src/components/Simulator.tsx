import { useState, useEffect } from 'react';

interface BudgetLevel {
  pct: number;
  fifo: { n: number; avg_score: number; total_amount: number; small_farmers: number; oblasts: number; avg_fraud: number };
  merit: { n: number; avg_score: number; total_amount: number; small_farmers: number; oblasts: number; avg_fraud: number };
}

interface SimData {
  pending_count: number;
  total_pending_amount: number;
  budget_levels: BudgetLevel[];
}

function formatTenge(amt: number): string {
  if (amt >= 1e9) return (amt / 1e9).toFixed(1) + ' млрд ₸';
  if (amt >= 1e6) return (amt / 1e6).toFixed(0) + ' млн ₸';
  return amt.toLocaleString() + ' ₸';
}

function MetricDelta({ label, fifo, merit, unit, better }: { label: string; fifo: number; merit: number; unit?: string; better: 'higher' | 'lower' }) {
  const delta = merit - fifo;
  const isGood = better === 'higher' ? delta > 0 : delta < 0;
  const sign = delta > 0 ? '+' : '';

  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-slate-200">{merit}{unit}</span>
        <span className={`text-sm font-medium ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
          {sign}{delta.toFixed(delta % 1 === 0 ? 0 : 1)}{unit}
        </span>
      </div>
      <div className="text-xs text-slate-500">FIFO: {fifo}{unit}</div>
    </div>
  );
}

export default function Simulator() {
  const [data, setData] = useState<SimData | null>(null);
  const [budgetPct, setBudgetPct] = useState(50);

  useEffect(() => {
    fetch('/data/simulator.json').then(r => r.json()).then(setData);
  }, []);

  if (!data) return null;

  const levelIdx = Math.max(0, Math.min(Math.round(budgetPct / 10) - 1, data.budget_levels.length - 1));
  const level = data.budget_levels[levelIdx];
  const { fifo, merit } = level;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">What-If Симулятор</h3>
          <p className="text-slate-400 text-sm mt-1">
            {data.pending_count.toLocaleString()} заявок в очереди • Общая сумма: {formatTenge(data.total_pending_amount)}
          </p>
        </div>
        <div className="bg-slate-800 rounded-lg px-3 py-1.5 text-sm">
          Бюджет: <span className="text-emerald-400 font-bold">{budgetPct}%</span>
        </div>
      </div>

      {/* Slider */}
      <div className="mb-6">
        <label className="text-sm text-slate-400 block mb-2">Доступный бюджет (%)</label>
        <input
          type="range"
          min={10}
          max={100}
          step={10}
          value={budgetPct}
          onChange={(e) => setBudgetPct(Number(e.target.value))}
          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
        />
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>10%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Comparison */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-red-950/20 border border-red-900/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-red-400 font-medium text-sm">FIFO (текущий)</span>
          </div>
          <div className="text-3xl font-bold text-red-300">{fifo.avg_score}</div>
          <div className="text-red-400/60 text-xs">средний Impact Score</div>
          <div className="mt-3 space-y-1 text-sm text-red-300/80">
            <div>{fifo.n.toLocaleString()} заявок</div>
            <div>{formatTenge(fifo.total_amount)}</div>
            <div>{fifo.small_farmers} мелких фермеров</div>
          </div>
        </div>

        <div className="bg-emerald-950/20 border border-emerald-900/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-emerald-400 font-medium text-sm">Merit (AgroScore)</span>
          </div>
          <div className="text-3xl font-bold text-emerald-300">{merit.avg_score}</div>
          <div className="text-emerald-400/60 text-xs">средний Impact Score</div>
          <div className="mt-3 space-y-1 text-sm text-emerald-300/80">
            <div>{merit.n.toLocaleString()} заявок</div>
            <div>{formatTenge(merit.total_amount)}</div>
            <div>{merit.small_farmers} мелких фермеров</div>
          </div>
        </div>
      </div>

      {/* Delta metrics */}
      <div className="grid grid-cols-3 gap-3">
        <MetricDelta label="Средний балл" fifo={fifo.avg_score} merit={merit.avg_score} better="higher" />
        <MetricDelta label="Мелких фермеров" fifo={fifo.small_farmers} merit={merit.small_farmers} better="higher" />
        <MetricDelta label="Сумма выплат" fifo={Math.round(fifo.total_amount / 1e9 * 10) / 10} merit={Math.round(merit.total_amount / 1e9 * 10) / 10} unit=" млрд" better="lower" />
      </div>

      {/* Budget levels chart */}
      <div className="mt-6">
        <div className="text-xs text-slate-500 mb-2">Средний балл при разном бюджете</div>
        <div className="flex items-end gap-1 h-24">
          {data.budget_levels.map((bl, i) => {
            const isActive = i === levelIdx;
            return (
              <div key={bl.pct} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex gap-0.5">
                  <div
                    className={`flex-1 rounded-t transition-all ${isActive ? 'bg-red-400' : 'bg-red-500/30'}`}
                    style={{ height: `${((bl.fifo.avg_score - 50) / 20) * 96}px` }}
                    title={`FIFO ${bl.pct}%: ${bl.fifo.avg_score}`}
                  />
                  <div
                    className={`flex-1 rounded-t transition-all ${isActive ? 'bg-emerald-400' : 'bg-emerald-500/30'}`}
                    style={{ height: `${((bl.merit.avg_score - 50) / 20) * 96}px` }}
                    title={`Merit ${bl.pct}%: ${bl.merit.avg_score}`}
                  />
                </div>
                <span className={`text-[9px] ${isActive ? 'text-white font-bold' : 'text-slate-600'}`}>
                  {bl.pct}%
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 justify-center mt-2 text-xs text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />FIFO</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1" />Merit</span>
        </div>
      </div>
    </div>
  );
}
