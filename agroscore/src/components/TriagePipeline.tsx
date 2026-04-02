import React from 'react';

interface TriageDistribution {
  A: number;
  B: number;
  C: number;
  D: number;
}

export default function TriagePipeline({ triage }: { triage: TriageDistribution }) {
  const total = triage.A + triage.B + triage.C + triage.D;
  const manualAuditCount = triage.C + triage.D;

  return (
    <div className="bg-[#0f172a] border border-indigo-900/40 rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-[0_20px_40px_rgba(30,27,75,0.7)] h-full flex flex-col justify-between">
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full" />
      
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="text-indigo-400">⏳</span> Operational Pipeline
        </h3>
        <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-900/50 text-indigo-300 border border-indigo-700 uppercase tracking-widest hidden sm:block">AI Triage</span>
      </div>

      <p className="text-slate-400 text-sm mb-6 leading-relaxed relative z-10">
        В пуле <strong className="text-white">{total.toLocaleString()}</strong> заявок. Кого из них Комиссии проверять на местах? В старой системе аудит проводится вслепую или по жалобам. AgroScore внедряет <b>AI Triage (Сортировку)</b>, точно наводя Комиссию только на аномалии (Классы C и D).
      </p>

      {/* Funnel Visualization */}
      <div className="flex-1 flex flex-col justify-center space-y-3 relative z-10">
         
         {/* Triage B */}
         <div className="w-full bg-slate-900 rounded-lg p-3 border border-emerald-900/30 flex justify-between items-center shadow-inner group transition-colors hover:border-emerald-500/50">
           <div className="flex flex-col">
             <div className="flex items-center gap-2 mb-1">
               <span className="w-6 h-6 rounded bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">B</span>
               <span className="text-slate-200 text-xs font-bold tracking-wide">Стандартные заявки (Trust)</span>
             </div>
             <span className="text-[10px] text-slate-500">Авто-одобрение (AgroScore: 40-65)</span>
           </div>
           <div className="text-xl font-black text-emerald-400 drop-shadow-md">
             {triage.B.toLocaleString()}
           </div>
         </div>

         {/* Triage A */}
         <div className="w-11/12 mx-auto bg-slate-900 rounded-lg p-3 border border-sky-900/30 flex justify-between items-center shadow-inner group transition-colors hover:border-sky-500/50">
           <div className="flex flex-col">
             <div className="flex items-center gap-2 mb-1">
               <span className="w-6 h-6 rounded bg-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-xs">A</span>
               <span className="text-slate-200 text-xs font-bold tracking-wide">Высокий Приоритет</span>
             </div>
             <span className="text-[10px] text-slate-500">Fast-track (AgroScore {'>'} 65)</span>
           </div>
           <div className="text-xl font-black text-sky-400 drop-shadow-md">
             {triage.A.toLocaleString()}
           </div>
         </div>

         <div className="w-full flex justify-center py-2 opacity-50">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
         </div>

         {/* Triage C */}
         <div className="w-10/12 mx-auto bg-amber-950/20 rounded-lg p-3 border border-amber-900/40 flex justify-between items-center shadow-inner relative overflow-hidden group hover:border-amber-500/50 transition-colors">
           <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
           <div className="flex flex-col pl-2">
             <div className="flex items-center gap-2 mb-1">
               <span className="w-6 h-6 rounded bg-amber-500/20 text-amber-500 font-bold flex items-center justify-center text-xs">C</span>
               <span className="text-amber-200 text-xs font-bold tracking-wide">Зона риска (Аудит)</span>
             </div>
             <span className="text-[10px] text-amber-500/70">Монополии / Аномалии</span>
           </div>
           <div className="text-lg font-black text-amber-500 drop-shadow-md">
             {triage.C.toLocaleString()}
           </div>
         </div>

         {/* Triage D */}
         <div className="w-8/12 mx-auto bg-red-950/20 rounded-lg p-3 border border-red-900/40 flex justify-between items-center shadow-inner relative group hover:border-red-500/50 transition-colors">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-600 animate-pulse" />
           <div className="flex flex-col pl-2">
             <div className="flex items-center gap-2 mb-1">
               <span className="w-6 h-6 rounded bg-red-500/20 text-red-500 font-bold flex items-center justify-center text-xs">D</span>
               <span className="text-red-200 text-xs font-bold tracking-wide">Isolation Forest</span>
             </div>
             <span className="text-[10px] text-red-500/70">API Бот Фрод</span>
           </div>
           <div className="text-lg font-black text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">
             {triage.D.toLocaleString()}
           </div>
         </div>

      </div>

      <div className="mt-8 pt-4 border-t border-indigo-900/50 text-center">
         <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Точность наведения аудита</div>
         <div className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">
           100% фокус на {manualAuditCount.toLocaleString()} риск-зонах
         </div>
      </div>
    </div>
  );
}
