import React from 'react';

// Type definitions ensuring type safety identical to the backend
interface OblastData {
  count: number;
  avg_score: number;
  total_amount: number;
}
interface ByOblast {
  [key: string]: OblastData;
}

export default function OblastDecentralization({ data }: { data: ByOblast }) {
  // Sort regions by total requested budget
  const sortedOblasts = Object.entries(data)
    .sort(([, a], [, b]) => b.total_amount - a.total_amount)
    .slice(0, 8); // Display top 8 for UI cleanly

  const maxAmount = Math.max(...sortedOblasts.map(([, val]) => val.total_amount));

  return (
    <div className="mt-8 mb-12 bg-[#090E17] border border-emerald-900/40 rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-2xl">
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <h3 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent tracking-tight">
          Тепловая Карта Децентрализации (Live Data)
        </h3>
      </div>
      
      <p className="text-slate-300 text-sm mb-10 leading-relaxed max-w-4xl relative z-10 border-l-4 border-emerald-500/50 pl-4 py-1">
        Система автоматически оценивает плотность капитала и средний <span className="text-emerald-400 font-bold">AgroScore</span> региона на базе {Object.values(data).reduce((s, d) => s + d.count, 0).toLocaleString()} реальных заявок. Красные зоны (низкий скор, огромный бюджет) пенализируются алгоритмом, перенаправляя средства в эффективные «зелёные» области.
      </p>

      <div className="grid gap-4 mt-8 relative z-10">
        {sortedOblasts.map(([name, stats], index) => {
          const widthPct = Math.max(15, (stats.total_amount / maxAmount) * 100);
          const isEfficient = stats.avg_score >= 62.0;

          return (
            <div key={name} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 group">
              <div className="w-48 text-xs font-bold text-slate-300 truncate" title={name}>
                {index + 1}. {name.replace("область", "обл.")}
              </div>
              
              <div className="flex-1 w-full h-8 bg-slate-900 rounded-sm relative border border-slate-800 flex items-center shadow-inner overflow-hidden">
                <div 
                  className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 flex items-center justify-end px-2
                    ${isEfficient 
                      ? 'bg-gradient-to-r from-emerald-900/50 to-emerald-500/80 border-r border-emerald-400 group-hover:to-emerald-400' 
                      : 'bg-gradient-to-r from-red-900/50 to-red-500/80 border-r border-red-400 group-hover:to-red-400'
                    }`}
                  style={{ width: `${widthPct}%` }}
                >
                  <span className="text-[10px] font-mono text-white/90 drop-shadow-md whitespace-nowrap">
                    {(stats.total_amount / 1e9).toFixed(1)} млрд ₸
                  </span>
                </div>
              </div>
              
              <div className="w-24 shrink-0 flex items-center justify-between bg-[#111827] px-2 py-1.5 rounded border border-slate-800">
                 <span className="text-[10px] text-slate-500 uppercase tracking-widest text-center w-full">Score</span>
                 <span className={`text-sm font-black font-mono ml-2 ${isEfficient ? 'text-emerald-400' : 'text-red-400'}`}>
                   {stats.avg_score.toFixed(1)}
                 </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Narrative Legend */}
      <div className="mt-8 flex gap-6 text-xs text-slate-400 pt-6 border-t border-slate-800/60 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-red-500/80" />
          <span>Монополия (Ниже среднего скора)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-emerald-500/80" />
          <span>Эффективные (Высокий скор)</span>
        </div>
      </div>
    </div>
  );
}
