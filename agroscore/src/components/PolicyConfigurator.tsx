import { useState, useEffect } from 'react';
import type { App } from './AppTable';

export default function PolicyConfigurator() {
  const [milkBonus, setMilkBonus] = useState(15);
  const [giniPenalty, setGiniPenalty] = useState(20);
  const [smbBonus, setSmbBonus] = useState(10);
  const [isCalculating, setIsCalculating] = useState(false);
  const [success, setSuccess] = useState(false);

  // Baseline metric tracking based on realistic limits (50B KZT total budget)
  const [approvedCount, setApprovedCount] = useState(13245);
  const [rejectedCount, setRejectedCount] = useState(23403);
  const totalCount = approvedCount + rejectedCount;

  const handleRecalculate = async () => {
    setIsCalculating(true);
    setSuccess(false);
    
    // Simulate network delay to let user see "Пересчет..."
    await new Promise(res => setTimeout(res, 600));

    try {
      const resp = await fetch('/data/all_apps.json');
      let apps: App[] = await resp.json();

      // 1. Math Map (Re-scoring 36K rows)
      apps = apps.map(app => {
          let s = app.s; // base score (max 100)
          
          // Milk priority
          if (app.code.includes('014')) s += milkBonus;
          
          // SMB Bonus (Amt < 5 Million KZT)
          if (app.amt < 5000000) s += smbBonus;
          
          // Gini Penalty (Monopolization - penalize large requests > 30M KZT)
          if (app.amt > 30000000) s -= giniPenalty;
          
          return { ...app, s }; 
      });

      // 2. Sort descending by new score
      apps.sort((a, b) => b.s - a.s);

      // 3. Triage / Reduce: Allocate limited 50B KZT Budget
      const BUDGET_LIMIT = 50000000000;
      let cumulativeBudget = 0;
      let approved = 0;
      let rejected = 0;

      for (const app of apps) {
          cumulativeBudget += app.amt;
          if (cumulativeBudget <= BUDGET_LIMIT) {
              approved++;
          } else {
              rejected++;
          }
      }

      setApprovedCount(approved);
      setRejectedCount(rejected);

      setIsCalculating(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (e) {
      console.error(e);
      setIsCalculating(false);
    }
  };

  return (
    <div className="bg-[#111827] border border-slate-700/80 rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-2xl h-full flex flex-col">
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />
      
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span className="text-xl">⚙️</span> Панель Министра (Policy Rules)
        </h3>
        <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-300 border border-slate-600 uppercase tracking-widest hidden sm:block">Упрощённая модель</span>
      </div>
      
      <p className="text-slate-400 text-sm mb-8 leading-relaxed relative z-10">
        Демонстрация принципа: изменяя веса, вы видите как меняется распределение бюджета для <b>36 648 заявок</b>. Используется упрощённая модель с плоскими бонусами/штрафами вместо полной 5-компонентной формулы Impact Score.
      </p>

      <div className="space-y-8 flex-1 relative z-10">
        {/* Slider 1 */}
        <div className="bg-[#0b121a] p-4 rounded-xl border border-slate-800/80 shadow-inner">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-bold text-slate-200">Приоритет отрасли (Молоко - 014*)</label>
            <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded">+{milkBonus} pts</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={milkBonus}
            onChange={(e) => setMilkBonus(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-colors"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
            <span>0</span>
            <span>+50 баллов</span>
          </div>
        </div>

        {/* Slider 2 */}
        <div className="bg-[#0b121a] p-4 rounded-xl border border-slate-800/80 shadow-inner">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-bold text-slate-200">Пенальти за гигантизм (Сумма &gt; 30М ₸)</label>
            <span className="text-red-400 font-mono font-bold bg-red-500/10 px-2 py-0.5 rounded">-{giniPenalty} pts</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={giniPenalty}
            onChange={(e) => setGiniPenalty(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-red-400 transition-colors"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
            <span>0</span>
            <span>-50 баллов</span>
          </div>
        </div>

        {/* Slider 3 */}
        <div className="bg-[#0b121a] p-4 rounded-xl border border-slate-800/80 shadow-inner">
          <div className="flex justify-between items-center mb-4">
            <label className="text-sm font-bold text-slate-200">Поддержка МСБ (Сумма &lt; 5М ₸)</label>
            <span className="text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2 py-0.5 rounded">+{smbBonus} pts</span>
          </div>
          <input
            type="range"
            min={0}
            max={30}
            step={5}
            value={smbBonus}
            onChange={(e) => setSmbBonus(Number(e.target.value))}
            className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:accent-emerald-400 transition-colors"
          />
          <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
            <span>0</span>
            <span>+30 баллов</span>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between items-center relative z-10">
        <div className="text-xs text-slate-500">Упрощённая модель: плоские бонусы к базовому баллу для 36K заявок</div>
        <button 
          onClick={handleRecalculate}
          disabled={isCalculating || success}
          className={`px-4 py-2 text-sm font-bold rounded transiton-colors shadow-[0_0_15px_rgba(16,185,129,0.4)] flex items-center gap-2 relative ${
            success ? 'bg-emerald-600 text-white' 
            : isCalculating ? 'bg-slate-700 text-slate-400 cursor-not-allowed shadow-none' 
            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-900'
          }`}
        >
          {isCalculating && (
            <svg className="animate-spin h-4 w-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {isCalculating ? 'Пересчет 36K заявок...' : success ? `Одобрено: ${approvedCount.toLocaleString()}` : 'Смоделировать Эффект'}
          
          {/* Simulated Impact Dropdown Notification */}
          {success && (
            <div className="absolute -top-12 right-0 whitespace-nowrap text-xs text-emerald-400 font-mono bg-emerald-950/90 px-3 py-1.5 rounded border border-emerald-500/30 animate-[pulse_2s_infinite]">
              Профинансировано {approvedCount.toLocaleString()} хозяйств
            </div>
          )}
        </button>
      </div>
      
      {/* Metric Visualizer showing dynamic outcome compared to true total count */}
      <div className="mt-4 flex h-1.5 w-full bg-red-900/30 rounded-full overflow-hidden border border-slate-800">
         <div 
           className="bg-emerald-500 h-full transition-all duration-1000 ease-in-out relative"
           style={{ width: `${(approvedCount / totalCount) * 100}%` }}
         >
            <div className="absolute inset-0 bg-white/20 w-full animate-[pulse_2s_infinite]"></div>
         </div>
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 mt-1 font-mono uppercase tracking-widest">
         <span>Одобрено пулом: {approvedCount.toLocaleString()} (Бюджет исчерпан)</span>
         <span>Ждут в резерве / Отказы: {rejectedCount.toLocaleString()}</span>
      </div>
    </div>
  );
}
