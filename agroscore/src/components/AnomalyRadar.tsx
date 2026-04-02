import { useState, useEffect } from 'react';
import type { App } from './AppTable';

export default function AnomalyRadar({ mlAnomaliesDetected = 304, onInvestigate }: { mlAnomaliesDetected?: number, onInvestigate?: (app: App) => void }) {
  const [anomalousApps, setAnomalousApps] = useState<App[]>([]);

  useEffect(() => {
    fetch('/data/all_apps.json')
      .then(r => r.json())
      .then((data: App[]) => {
        // filter apps with anomaly > 70
        const highlyAnomalous = data.filter(a => a.ano > 70).sort((a,b) => b.ano - a.ano).slice(0, 50);
        setAnomalousApps(highlyAnomalous);
      })
      .catch(console.error);
  }, []);
  return (
    <div className="bg-[#0B1120] border border-red-900/40 rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl">
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-red-500/10 blur-3xl rounded-full" />
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30">
          <span className="text-red-500 text-lg">📡</span>
        </div>
        <h3 className="text-2xl font-bold bg-gradient-to-r from-red-400 to-amber-500 bg-clip-text text-transparent tracking-tight">Радар Аномалий (ML-Слой)</h3>
      </div>
      
      <p className="text-slate-300 mb-6 leading-relaxed italic border-l-4 border-slate-700 pl-5 py-1">
        "Честный фермер спит в 3 часа ночи. Боты и 'помогайки' с API-скриптами подают заявки глубокой ночью, чтобы перехватить открывшийся мартовский транш. Predictive ML бы вознаградил это как 'своевременность'. Наш Isolation Forest помечает это как Фрод."
      </p>

      <div className="bg-slate-950/80 rounded-xl border border-red-900/30 p-6 flex flex-col sm:flex-row items-center gap-8 shadow-[inset_0_2px_15px_rgba(0,0,0,0.5)]">
        {/* Radar Map Logic */}
        <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full border border-red-500/30 relative flex items-center justify-center shrink-0">
          <div className="absolute inset-0 rounded-full border border-red-500/20 animate-ping opacity-30" />
          <div className="absolute inset-2 rounded-full border border-red-500/40" />
          <div className="absolute inset-6 rounded-full border border-red-500/60" />
          {/* Radar dash */}
          <div className="w-full h-full absolute animate-[spin_3s_linear_infinite] rounded-full border-t border-r border-red-500/60" />
          {/* Dots */}
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 absolute top-8 left-8 shadow-[0_0_12px_rgba(239,68,68,1)] animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-red-500 absolute bottom-10 right-6 shadow-[0_0_8px_rgba(239,68,68,1)] animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-red-400 absolute top-12 right-10 opacity-70" />
        </div>

        <div>
          <div className="flex items-end gap-3 mb-2">
            <span className="text-5xl md:text-6xl font-black text-red-500 tracking-tighter drop-shadow-[0_0_15px_rgba(239,68,68,0.4)]">{mlAnomaliesDetected}</span>
            <span className="text-lg text-slate-400 pb-1.5 font-bold uppercase tracking-wider">заявок</span>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
            было изолировано в реальном датасете через Isolation Forest. Автоматически переведены в статус "Глубокий аудит" для ручной проверки Комиссией.
          </p>
        </div>
      </div>

      {/* Live Terminal Log */}
      <div className="mt-6 bg-[#06090e] border border-slate-800 rounded-lg p-0 font-mono text-[10px] md:text-[11px] h-64 overflow-y-auto relative shadow-[inset_0_0_15px_rgba(0,0,0,0.8)]">
         <div className="sticky top-0 bg-[#06090e]/95 backdrop-blur-sm border-b border-slate-800 px-4 py-2.5 flex items-center justify-between z-10">
           <span className="text-slate-400 font-bold tracking-widest text-[9px] uppercase">TOP {anomalousApps.length} Опасных Аномалий (Isolation Forest)</span>
           <span className="text-red-500 animate-[pulse_2s_ease-in-out_infinite] flex items-center gap-2"><div className="w-1.5 h-1.5 bg-red-500 rounded-full"/> СИСТЕМА ПЕРЕХВАТА</span>
         </div>
         
         <div className="space-y-0.5 p-2 pb-6">
            {anomalousApps.map(app => (
              <div 
                key={app.r} 
                onClick={() => onInvestigate && onInvestigate(app)}
                className="flex gap-3 items-center p-2.5 hover:bg-slate-800/80 rounded transition-colors cursor-pointer group border border-transparent hover:border-slate-700 hover:shadow-lg"
              >
                 <span className="text-slate-500 shrink-0">[{app.date || 'Ночь'}]</span>
                 <span className="text-red-500 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-bold shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.3)] min-w-[100px] text-center">
                   ML: {app.ano}%
                 </span>
                 <span className="text-red-400 truncate flex-1 group-hover:text-red-300">
                   ID: {app.r} | Сумма: {(app.amt / 1000000).toFixed(1)}М ₸ | Регион: {app.o.length > 15 ? app.o.slice(0,15) + '...' : app.o} 
                 </span>
                 <span className="text-white text-[9px] font-bold bg-amber-600 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hidden sm:inline-block">
                   🔍 Расследовать дело
                 </span>
              </div>
            ))}
            {anomalousApps.length === 0 && (
              <div className="p-8 text-center text-slate-500 animate-pulse flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                Загрузка перехваченных сессий...
              </div>
            )}
         </div>
      </div>
    </div>
  );
}
