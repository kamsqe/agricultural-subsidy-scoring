import { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const SYSTEM_PROMPT = `Ты — AgroScore AI-ассистент. Ты помогаешь фермерам и чиновникам разобраться в системе ранжирования сельхозсубсидий Казахстана.

КОНТЕКСТ СИСТЕМЫ:
- AgroScore ранжирует 36,651 заявок на субсидии племенного животноводства (2025 год)
- Вместо FIFO (первым пришёл — первым получил) используется merit-based Impact Score
- Impact Score = 20% Strategic + 20% Fairness + 20% Need + 20% Efficiency - 10% Fraud + 10% Base(50) + Exception Points(0-15)
- Triage bands: A(≥65, высокий приоритет), B(55-64, стандартный), C(40-54, низкий), D(<40, отклонение)

КОМПОНЕНТЫ СКОРИНГА:
1. Strategic Alignment (0-100): приоритеты АПК, продовольственная безопасность, племенное направление
2. Fairness (0-100): анти-монополия района, медианное отклонение суммы, размер фермера
3. Regional Need (0-100): бэклог области, ср. балл района, reject rate
4. Efficiency (0-100): история подач, репутация района, обоснованность суммы
5. Fraud Risk (0-100, вычитается): круглые суммы, outliers, чрезмерные повторы, монополизация, ночные подачи

EXCEPTION POINTS (0-15 бонус):
- Первая подача: +5
- Область с высоким бэклогом: +5
- Мелкий фермер в монополизированном районе: +5

КЛЮЧЕВЫЕ ДАННЫЕ:
- Диапазон баллов: 35.9 — 84.0, среднее: 61.8, медиана: 62.6
- FIFO vs Merit (при 50% бюджете): Merit даёт +4.4 средний балл, +108 мелких фермеров
- Gini коэффициент (район): 0.648
- Fraud high-risk: 7 заявок (0.02%)
- 30% заявок — повторные подачи

ПРАВИЛА:
- Отвечай на русском или казахском (как спросили)
- Будь конкретен, приводи цифры из данных
- Если не знаешь — честно скажи
- Объясняй как улучшить балл конкретными действиями
- Не придумывай данных которых нет`;

const SUGGESTED_QUESTIONS = [
  'Как работает Impact Score?',
  'Почему Merit лучше FIFO?',
  'Как повысить балл заявки?',
  'Что такое Fraud Risk?',
  'Какие области набирают больше?',
];

export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Try to load API key from build-time env or localStorage
    const envKey = (import.meta as any).env?.PUBLIC_GEMINI_API_KEY || '';
    const storedKey = localStorage.getItem('agroscore_gemini_key') || '';
    setApiKey(envKey || storedKey);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const saveKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('agroscore_gemini_key', key);
    setShowKeyInput(false);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    if (!apiKey) { setShowKeyInput(true); return; }

    const userMsg: Message = { role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [
              ...history,
              { role: 'user', parts: [{ text: text.trim() }] },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024,
            },
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`API error ${response.status}: ${err.slice(0, 200)}`);
      }

      const data = await response.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Не удалось получить ответ.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Ошибка: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg shadow-emerald-900/30 transition-all hover:scale-110 z-50"
        title="AI-ассистент"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[560px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-medium text-sm">AgroScore AI</span>
          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded">Gemini</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowKeyInput(!showKeyInput)} className="text-slate-500 hover:text-slate-300 text-xs">
            {apiKey ? '🔑' : '⚠️'}
          </button>
          <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white transition">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {/* API Key Input */}
      {showKeyInput && (
        <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-800">
          <label className="text-[10px] text-slate-500 block mb-1">Gemini API Key</label>
          <div className="flex gap-1">
            <input
              type="password"
              defaultValue={apiKey}
              placeholder="AIzaSy..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              onKeyDown={e => { if (e.key === 'Enter') saveKey((e.target as HTMLInputElement).value); }}
            />
            <button
              onClick={e => {
                const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                saveKey(input.value);
              }}
              className="bg-emerald-600 text-white text-xs px-2 rounded hover:bg-emerald-500"
            >OK</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div>
            <p className="text-slate-400 text-sm mb-3">Задайте вопрос о системе скоринга, данных или методологии:</p>
            <div className="space-y-1.5">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="block w-full text-left text-xs bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-slate-300 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-500/20'
                : 'bg-slate-800/50 text-slate-200 border border-slate-700/30'
            }`}>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/50 rounded-xl px-3 py-2 text-sm text-slate-400 border border-slate-700/30">
              <span className="animate-pulse">Думаю...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendMessage(input); }}
            placeholder={apiKey ? 'Ваш вопрос...' : 'Введите API key (🔑) чтобы начать'}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
            disabled={loading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white px-3 rounded-lg transition"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
