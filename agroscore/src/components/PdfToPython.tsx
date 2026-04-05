import { useState } from 'react';

export default function PdfToPython() {
  const [inputText, setInputText] = useState("В целях поддержки малых фермерских хозяйств, приоритетное субсидирование (high priority) должно оказываться предприятиям с общей площадью посевных земель менее 500 га.");
  const [isProcessing, setIsProcessing] = useState(false);
  const [outputJson, setOutputJson] = useState<string | null>(null);

  const handleConvert = async () => {
    const key = localStorage.getItem('agroscore_gemini_key') || '';
    if (!key) {
      alert("Сначала ведите Gemini API ключ в настройках ассистента.");
      return;
    }

    setIsProcessing(true);
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Ты специализированный AI-ассистент (Policy Engine Translator). Твоя задача: прочитать фрагмент юридического документа о субсидиях и вернуть СТРОГО один JSON объект с параметрами конфигурации без Markdown форматирования.
Определи:
- "entity": тип сущности (например, "small_farm")
- "condition": математическое условие для кода (например, "area < 500")
- "priority": приоритет ("high", "medium", "low")

Текст закона:
"${inputText}"`
            }]
          }]
        })
      });
      
      const data = await resp.json();
      let rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Remove possible markdown formatting from Gemini
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      setOutputJson(rawText);
    } catch (e) {
      console.error(e);
      alert("Ошибка при обращении к Gemini API.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-6 md:p-8 relative overflow-hidden shadow-[0_10px_30px_rgba(99,102,241,0.1)]">
      <div className="absolute -top-[20%] -right-[10%] w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full" />
      <div className="flex items-center gap-4 mb-6 relative z-10">
        <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
          <span className="text-2xl drop-shadow-md">✨</span>
        </div>
        <div>
          <h3 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-indigo-300 to-sky-300 bg-clip-text text-transparent">
            От Правового Текста к Коду (Generative AI)
          </h3>
          <p className="text-sm text-slate-400 mt-1">LLM как безопасный слой трансляции права.</p>
        </div>
      </div>
      
      <p className="text-slate-300 mb-8 leading-relaxed italic border-l-4 border-indigo-500/50 pl-5 py-1 relative z-10">
        "Мы используем LLM (Gemini) не для того, чтобы гадать кто прав или виноват, а чтобы безошибочно транслировать тексты новых законов РК в строгую математику для нашего Policy Engine."
      </p>

      {/* 2-Column Real Pipeline */}
      <div className="grid lg:grid-cols-2 gap-5 relative z-10">
        
        {/* Step 1: Input Document */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 relative z-10 flex flex-col shadow-lg">
          <div className="bg-[#1C2128] text-[9px] text-slate-400 font-bold px-2 py-1 rounded mb-4 uppercase tracking-widest w-full text-center border border-slate-700/50">Входящий документ (Закон)</div>
          <textarea 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 h-32 focus:border-indigo-500 outline-none transition-colors"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button 
            onClick={handleConvert}
            disabled={isProcessing}
            className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] text-sm"
          >
            {isProcessing ? <span className="animate-spin">⚙️</span> : <span>✨</span>}
            Транслировать в Policy JSON
          </button>
        </div>

        {/* Step 2: Output JSON */}
        <div className="bg-[#111827] border border-indigo-500/40 rounded-xl p-5 relative z-10 flex flex-col shadow-[0_0_25px_rgba(99,102,241,0.15)]">
          <div className="bg-indigo-900/40 text-[9px] text-indigo-300 font-bold px-2 py-1 rounded mb-4 uppercase tracking-widest w-full text-center border border-indigo-500/20">System Output (Constraints)</div>
          
          <div className="w-full flex-1 bg-[#0D1117] p-4 border border-slate-800/80 rounded text-left font-mono text-xs sm:text-sm text-sky-300 shadow-inner overflow-auto h-32 relative">
            {isProcessing ? (
              <div className="flex w-full h-full items-center justify-center text-indigo-500/50 blink">
                Ожидание ответа Gemini...
              </div>
            ) : outputJson ? (
              <pre className="whitespace-pre-wrap">{outputJson}</pre>
            ) : (
              <div className="flex w-full h-full items-center justify-center opacity-50 px-4 text-center text-slate-500">
                Нажмите "Транслировать", чтобы сгенерировать программный код для Rules Engine.
              </div>
            )}
          </div>
          <div className="mt-4 text-xs text-slate-500 text-center">
            * Демонстрация: JSON можно экспортировать для интеграции в Rules Engine
          </div>
        </div>

      </div>
    </div>
  );
}
