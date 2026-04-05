import { useState, useEffect } from 'react';

interface FifoVsMerit {
  pending_count: number;
  fifo: { avg_score: number; small_farmer_count: number; total_amount: number };
  merit: { avg_score: number; small_farmer_count: number; total_amount: number };
  improvement: { avg_score_delta: number; small_farmer_delta: number };
}

export default function MacroRoi() {
  const [data, setData] = useState<FifoVsMerit | null>(null);

  useEffect(() => {
    fetch('/data/scoring_summary.json')
      .then(r => r.json())
      .then(d => setData(d.fifo_vs_merit))
      .catch(console.error);
  }, []);

  const ratio = data
    ? (data.fifo.total_amount / Math.max(data.merit.total_amount, 1)).toFixed(1)
    : '—';
  const smallDelta = data ? `+${data.improvement.small_farmer_delta}` : '—';
  const fifoB = data ? (data.fifo.total_amount / 1e9).toFixed(2) : '—';
  const meritB = data ? (data.merit.total_amount / 1e9).toFixed(2) : '—';
  const pendingCount = data ? data.pending_count.toLocaleString() : '—';

  return (
    <section className="py-24 relative overflow-hidden bg-[#020617] border-t border-slate-800/50">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-emerald-900/20 via-[#020617] to-[#020617]" />
      
      {/* Background decorative elements */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
      <div className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-emerald-500/10 blur-[100px] rounded-full" />

      <div className="max-w-7xl mx-auto px-4 relative z-10 text-center">
        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-8 drop-shadow-lg">
          Национальный Эффект <span className="bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">AgroScore</span>
        </h2>
        
        <p className="text-xl md:text-2xl text-slate-400 font-light mb-16 max-w-4xl mx-auto leading-relaxed">
          Прозрачность — это не просто слово. Это реальные миллиарды тенге, возвращенные в экономику сел и направленные на развитие реального бизнеса.
        </p>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 max-w-5xl mx-auto">
          {/* ROI Metric 1 */}
          <div className="bg-[#0f172a]/80 backdrop-blur-sm border border-slate-800 rounded-3xl p-10 relative overflow-hidden group hover:border-emerald-500/50 transition-colors shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 blur-[50px] rounded-full transition-all group-hover:bg-amber-500/10" />
            <div className="text-left relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
                  <span className="text-3xl text-amber-500">🏭</span>
                </div>
                <div className="text-sm text-slate-400 font-bold uppercase tracking-widest">Агрохолдинги</div>
              </div>
              <div className="space-y-1 mb-4">
                <div className="text-5xl md:text-6xl font-black text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.3)] tracking-tighter">
                  {ratio}<span className="text-3xl">x</span>
                </div>
              </div>
              <p className="text-slate-300 text-lg leading-relaxed">
                Эффективнее расход бюджета: merit-based тратит {meritB} млрд ₸ вместо {fifoB} млрд ₸ при FIFO для того же числа одобренных заявок.
              </p>
            </div>
          </div>

          {/* ROI Metric 2 */}
          <div className="bg-[#0f172a]/80 backdrop-blur-sm border border-slate-800 rounded-3xl p-10 relative overflow-hidden group hover:border-emerald-500/50 transition-colors shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[50px] rounded-full transition-all group-hover:bg-emerald-500/10" />
            <div className="text-left relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
                  <span className="text-3xl text-emerald-500">🚜</span>
                </div>
                <div className="text-sm text-slate-400 font-bold uppercase tracking-widest">Малый Бизнес</div>
              </div>
              <div className="space-y-1 mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl md:text-6xl font-black text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)] tracking-tighter">{smallDelta}</span>
                  <span className="text-2xl text-emerald-500/70 font-bold">фермеров</span>
                </div>
              </div>
              <p className="text-slate-300 text-lg leading-relaxed">
                Дополнительных малых хозяйств попадают в финансирование при переключении с FIFO на merit-based (симуляция на {pendingCount} заявках).
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16 flex justify-center">
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900 border border-slate-800 rounded-full shadow-lg">
               <span className="w-3 h-3 rounded-full bg-sky-500 animate-pulse" />
               <span className="text-slate-300 text-sm font-mono">Прототип | Расчёт на реальных данных 2025 | scoring_summary.json</span>
            </div>
        </div>
      </div>
    </section>
  );
}
