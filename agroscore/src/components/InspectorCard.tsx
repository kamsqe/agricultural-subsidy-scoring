import { useState, useEffect } from 'react';
import type { App } from './AppTable';

interface InspectorCardProps {
  appData?: App | null;
  minimal?: boolean;
}

export default function InspectorCard({ appData, minimal = false }: InspectorCardProps) {
  const [llmAudit, setLlmAudit] = useState<string>('');
  const [loadingLlm, setLoadingLlm] = useState<boolean>(false);
  const [llmError, setLlmError] = useState<string>('');
  const [modalConfig, setModalConfig] = useState<{type: 'approve'|'audit'|'decline', title: string, message: string} | null>(null);
  
  // Hardcoded fallback logic in case there's no API key
  const generateFallbackText = (app: App) => {
    if (app.fr > 50 || app.ano > 70) {
      return `Внимание: Выявлена мощная ML-аномалия (${app.ano}%) или риск-паттерн. Заявка на сумму ${(app.amt/1e6).toFixed(1)}М ₸ из ${app.o} демонстрирует признаки скоординированной подачи или искусственного дробления.`;
    } else if (app.s >= 65) {
      return `Данное хозяйство правомерно получило приоритетный балл. Заявка соответствует целям развития АПК, фермер не имеет аномалий в исторических подачах (Retry: ${app.retry}).`;
    } else if (app.sc < 10) {
      return `Стратегический балл снижен: направление субсидирования "${app.cat}" в данный момент не является высокоприоритетным для фонда.`;
    } else {
      return `Заявка находится в стандартном диапазоне (Класс ${app.t}). Требуется типовая верификация целевого использования средств.`;
    }
  };

  useEffect(() => {
    if (!appData) return;

    const fetchAudit = async () => {
      // Avoid fetching if we already have it for this specific state? Not strictly necessary to cache for this prototype, but good practice.
      
      const apiKey = (import.meta as any).env?.PUBLIC_GEMINI_API_KEY || localStorage.getItem('agroscore_gemini_key');
      
      if (!apiKey) {
        setLlmAudit(generateFallbackText(appData));
        setLlmError('no_key');
        return;
      }

      setLoadingLlm(true);
      setLlmError('');
      setLlmAudit('');

      try {
        const prompt = `Ты — эксперт-аудитор комиссии по распределению сельхозсубсидий (LLM).
Проанализируй следующую заявку и выдай краткое резюме (максимум 2-3 предложения).
Обязательно упомяни, если есть высокий риск (Fraud Risk или ML Аномалия), или обоснуй почему балл высокий/низкий. 

Данные заявки:
ID: ${appData.r}
Регион: ${appData.o}, ${appData.d}
Сумма: ${(appData.amt).toLocaleString('ru-RU')} ₸
Тип (код): ${appData.code} (${appData.cat})
Повторных подач: ${appData.retry}

Метрики AgroScore:
Итоговый балл: ${appData.s.toFixed(1)} (Приоритет: Класс ${appData.t})
Strategic Alignment (Отраслевая стратегия): ${appData.sc}
Fairness (Справедливость/Доступность): ${appData.fc}
Regional Need (Нужда региона): ${appData.nc}
Efficiency (Эффективность): ${appData.ec}
Fraud Risk (Риск мошенничества): ${appData.fr} 
ML Аномалия: ${appData.ano}%

Вывод должен быть строгим, профессиональным, на русском языке.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 250 },
            }),
          }
        );

        if (!response.ok) {
          throw new Error('API Request failed');
        }

        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        setLlmAudit(reply);
      } catch (err: any) {
        console.error(err);
        setLlmError('error');
        setLlmAudit(generateFallbackText(appData));
      } finally {
        setLoadingLlm(false);
      }
    };

    fetchAudit();
  }, [appData]);

  if (!appData) {
    return (
      <div className={`bg-[#0d1620] border border-blue-900/30 rounded-2xl p-6 md:p-10 relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${minimal ? 'mb-0 mt-0 h-full flex flex-col items-center justify-start pt-20' : 'mb-12 mt-12 min-h-[300px] flex items-center justify-center'}`}>
        <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-slate-600 via-slate-700 to-slate-800" />
        <div className="text-center text-slate-500">
          <div className="text-4xl mb-4 opacity-50">📋</div>
          <p>Выберите заявку в реестре для просмотра карточки инспектора</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#0d1620] border border-blue-900/30 rounded-2xl p-6 relative overflow-hidden flex flex-col ${minimal ? 'mb-0 mt-0 h-full' : 'mb-12 mt-12 md:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]'}`}>
      <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-blue-600 via-sky-400 to-indigo-500" />
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />

      {!minimal && (
        <>
          <div className="flex items-center gap-3 mb-8 relative z-10">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/30">
              <span className="text-blue-400 text-lg">🪪</span>
            </div>
            <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-sky-300 bg-clip-text text-transparent transform">
              X-Ray Инспектор (Explainable AI)
            </h3>
          </div>
          
          <p className="text-slate-300 text-sm mb-8 leading-relaxed max-w-4xl relative z-10">
            Мы не доверяем алгоритму слепо. Это интерфейс <b>Комиссии</b> при клике на сомнительную заявку в таблице. Механика прозрачного математического чека (Math Receipt) и мгновенный легальный аудит от LLM Gemini.
          </p>
        </>
      )}

      {minimal && (
        <div className="flex items-center gap-3 mb-4 border-b border-slate-800 pb-3 relative z-10">
          <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/30">
            <span className="text-blue-400 text-sm">🪪</span>
          </div>
          <h3 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-sky-300 bg-clip-text text-transparent">
            Комиссионный Инспектор
          </h3>
        </div>
      )}

      <div className={`grid gap-6 relative z-10 flex-1 overflow-auto ${minimal ? 'grid-cols-1' : 'lg:grid-cols-[1fr_1.5fr_1fr]'}`}>
        {/* Left: Applicant Profile */}
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-inner flex flex-col shrink-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-4 border-b border-slate-800 pb-2">Профиль Заявителя</div>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center text-2xl border-2 border-emerald-500/50 shrink-0">
              {appData.t === 'D' ? '🚫' : appData.t === 'C' ? '⚠️' : '👨‍🌾'}
            </div>
            <div className="overflow-hidden">
              <h4 className="text-slate-200 font-bold text-sm truncate" title={appData.cat}>{appData.cat}</h4>
              <p className="text-xs text-blue-400 font-mono">ID: {appData.r}</p>
            </div>
          </div>
          <div className="space-y-3 text-xs flex-1">
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
               <span className="text-slate-500">Код (ОКЭД)</span>
               <span className="text-slate-300 font-mono truncate max-w-[120px]" title={appData.code}>{appData.code}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
               <span className="text-slate-500">Район</span>
               <span className="text-slate-300 truncate max-w-[120px]" title={appData.d}>{appData.d}</span>
            </div>
            <div className="flex justify-between border-b border-slate-800/60 pb-2">
               <span className="text-slate-500">Регион</span>
               <span className="text-slate-300 truncate max-w-[120px]" title={appData.o}>{appData.o}</span>
            </div>
            <div className="flex justify-between pt-1">
               <span className="text-slate-500">Сумма</span>
               <span className="text-emerald-400 font-bold">{(appData.amt).toLocaleString('ru-RU')} ₸</span>
            </div>
          </div>
        </div>

        {/* Center: Math Receipt */}
        <div className="bg-[#0b121a] border border-blue-900/30 rounded-xl p-5 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)] flex flex-col justify-between shrink-0">
          <div className="flex justify-between items-center mb-4 border-b border-blue-900/40 pb-2">
             <div className="text-[10px] text-blue-400 uppercase tracking-widest font-bold">AgroScore Breakdown (Чек)</div>
             <div className="text-[10px] bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">Rules Engine</div>
          </div>
          
          <div className="font-mono text-sm space-y-3 flex-1 pr-2">
            <div className="flex justify-between items-center group">
               <span className="text-slate-400 group-hover:text-slate-200 transition-colors shrink-0">База</span>
               <span className="mx-2 border-b border-dotted border-slate-700 flex-1"></span>
               <span className="text-slate-300 font-bold">{(appData.s - appData.sc*0.2 - appData.fc*0.2 - appData.nc*0.2 - appData.ec*0.2 + appData.fr*0.1 - appData.ex).toFixed(1)} <span className="text-[10px] text-slate-500 font-normal">pts</span></span>
            </div>
            <div className="flex justify-between items-center group">
               <span className="text-sky-400 group-hover:text-sky-300 transition-colors shrink-0">Стратегия (S)</span>
               <span className="mx-2 border-b border-dotted border-sky-900/50 flex-1"></span>
               <span className="text-sky-400 font-bold">+{ (appData.sc * 0.2).toFixed(1) } <span className="text-[10px] text-sky-500/50 font-normal">pts</span></span>
            </div>
            <div className="flex justify-between items-center group">
               <span className="text-violet-400 group-hover:text-violet-300 transition-colors shrink-0">Справедливость (F)</span>
               <span className="mx-2 border-b border-dotted border-violet-900/50 flex-1"></span>
               <span className="text-violet-400 font-bold">+{ (appData.fc * 0.2).toFixed(1) } <span className="text-[10px] text-violet-500/50 font-normal">pts</span></span>
            </div>
            <div className="flex justify-between items-center group">
               <span className="text-amber-400 group-hover:text-amber-300 transition-colors shrink-0">Локальная нужда (N)</span>
               <span className="mx-2 border-b border-dotted border-amber-900/50 flex-1"></span>
               <span className="text-amber-400 font-bold">+{ (appData.nc * 0.2).toFixed(1) } <span className="text-[10px] text-amber-500/50 font-normal">pts</span></span>
            </div>
            <div className="flex justify-between items-center group">
               <span className="text-emerald-400 group-hover:text-emerald-300 transition-colors shrink-0">Эффективность (E)</span>
               <span className="mx-2 border-b border-dotted border-emerald-900/50 flex-1"></span>
               <span className="text-emerald-400 font-bold">+{ (appData.ec * 0.2).toFixed(1) } <span className="text-[10px] text-emerald-500/50 font-normal">pts</span></span>
            </div>
            {(appData.fr > 0 || appData.ano > 0) && (
              <div className="flex justify-between items-center group opacity-90">
                 <span className="text-red-400 group-hover:text-red-300 transition-colors shrink-0">Fraud/Anomaly Risk</span>
                 <span className="mx-2 border-b border-dotted border-red-900/50 flex-1"></span>
                 <span className="text-red-400 font-bold">-{ (appData.fr * 0.1).toFixed(1) } <span className="text-[10px] text-red-500/50 font-normal">pts</span></span>
              </div>
            )}
            {appData.ex > 0 && (
              <div className="flex justify-between items-center group">
                 <span className="text-fuchsia-400 group-hover:text-fuchsia-300 transition-colors shrink-0">Exception Points</span>
                 <span className="mx-2 border-b border-dotted border-fuchsia-900/50 flex-1"></span>
                 <span className="text-fuchsia-400 font-bold">+{ appData.ex } <span className="text-[10px] text-fuchsia-500/50 font-normal">pts</span></span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t-2 border-dashed border-blue-900/40 flex justify-between items-end">
            <div className="text-slate-400 text-xs flex flex-col gap-1">
               <span>Итоговый Merit Score</span>
               <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold self-start ${appData.t === 'A' ? 'bg-emerald-500/20 text-emerald-400' : appData.t === 'B' ? 'bg-sky-500/20 text-sky-400' : appData.t === 'C' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>Класс ${appData.t}</span>
            </div>
            <div className="text-3xl font-black text-sky-400 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">{appData.s.toFixed(1)}</div>
          </div>
        </div>

        {/* Right: LLM Legal Audit */}
        <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-5 shadow-inner relative flex flex-col shrink-0">
          <div className="text-[10px] text-indigo-400 uppercase tracking-widest font-bold mb-4 border-b border-indigo-900/40 pb-2 flex justify-between items-center">
            <span>LLM Аудит (Право)</span>
            {loadingLlm ? (
              <span className="animate-spin text-indigo-400">⚙️</span>
            ) : (
              <span>✨</span>
            )}
          </div>
          
          <div className="flex-1 flex flex-col justify-center">
             <div className={`bg-indigo-950/50 p-4 rounded-lg border relative transition-colors ${llmError ? 'border-amber-500/30' : 'border-indigo-500/20'}`}>
               <div className={`absolute -left-2 top-4 w-4 h-4 bg-[#0d1620] border-t border-l transform -rotate-45 ${llmError ? 'border-amber-500/30 bg-amber-950/30' : 'border-indigo-500/20 bg-indigo-950/50'}`} />
               {loadingLlm ? (
                 <div className="flex items-center gap-2 text-indigo-300 text-xs italic">
                   <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                   Gemini анализирует заявку...
                 </div>
               ) : (
                 <div className="text-xs text-indigo-200 leading-relaxed z-10 relative">
                   {llmAudit.split('\n').map((line, i) => (
                     <span key={i} className="block mb-2 last:mb-0">
                       {line.startsWith('*') ? line.replace(/\*/g, '') : line}
                     </span>
                   ))}
                 </div>
               )}
             </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
             <div className="flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${llmError ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
               <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                 {llmError === 'no_key' ? 'Heuristic Fallback (No Key)' : llmError ? 'Heuristic Fallback (API Error)' : 'Gemini Verified'}
               </span>
             </div>
             {llmError === 'no_key' && (
                <span className="text-[9px] text-slate-600">Введите API Key в чате</span>
             )}
          </div>
        </div>
      </div>

      {/* Action Buttons (Workflow) */}
      <div className="mt-6 pt-5 border-t border-slate-800 flex gap-3">
        <button 
          onClick={() => setModalConfig({
            type: 'approve',
            title: 'Транш Одобрен',
            message: `Заявка ID: ${appData.r} предварительно одобрена. Заявка (${(appData.amt).toLocaleString('ru-RU')} ₸) направлена на рассмотрение комиссии.`
          })}
          className="flex-1 bg-emerald-600/20 hover:bg-emerald-500 border border-emerald-500/50 hover:border-emerald-400 text-emerald-400 hover:text-white text-sm font-bold py-2.5 px-4 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2"
        >
          Одобрить транш
        </button>
        {appData.fr > 50 || appData.ano > 70 ? (
          <button 
            onClick={() => setModalConfig({
              type: 'audit',
              title: 'Передано Комиссии',
              message: `Сбор доказательной базы завершен. Заявка ID: ${appData.r} переведена в статус "Глубокий аудит" из-за аномалий.`
            })}
            className="flex-1 bg-amber-600/20 hover:bg-amber-500 border border-amber-500/50 hover:border-amber-400 text-amber-400 hover:text-white text-sm font-bold py-2.5 px-4 rounded-lg transition-all shadow-lg flex items-center justify-center gap-2"
          >
            Назначить Комиссию
          </button>
        ) : (
          <button 
            onClick={() => setModalConfig({
              type: 'decline',
              title: 'Заявка Отклонена',
              message: `Заявка ID: ${appData.r} отклонена. Соответствующее уведомление было автоматически направлено в личный кабинет фермера.`
            })}
            className="flex-1 bg-red-950/30 hover:bg-red-900 border border-red-900/50 hover:border-red-500 text-red-500 hover:text-red-100 text-sm font-bold py-2.5 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
          >
            Отклонить заявку
          </button>
        )}
      </div>

      {/* Action Modal */}
      {modalConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b14]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className={`h-2 w-full ${
              modalConfig.type === 'approve' ? 'bg-emerald-500' :
              modalConfig.type === 'audit' ? 'bg-amber-500' : 'bg-red-500'
            }`} />
            <div className="p-6 md:p-8">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0 ${
                  modalConfig.type === 'approve' ? 'bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] border border-emerald-500/30' :
                  modalConfig.type === 'audit' ? 'bg-amber-500/20 shadow-[0_0_20px_rgba(245,158,11,0.3)] border border-amber-500/30' : 
                  'bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.3)] border border-red-500/30'
                }`}>
                  {modalConfig.type === 'approve' ? '✅' : modalConfig.type === 'audit' ? '🔍' : '❌'}
                </div>
                <h3 className="text-2xl font-bold text-white tracking-tight">{modalConfig.title}</h3>
              </div>
              
              <p className="text-slate-300 text-base leading-relaxed mb-8 pt-2">
                {modalConfig.message}
              </p>
              
              <div className="flex justify-end gap-3 mt-4">
                <button 
                  onClick={() => setModalConfig(null)}
                  className={`px-6 py-2.5 rounded-lg font-bold text-white transition-colors ${
                    modalConfig.type === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' :
                    modalConfig.type === 'audit' ? 'bg-amber-600 hover:bg-amber-500' :
                    'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  Понятно, закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
