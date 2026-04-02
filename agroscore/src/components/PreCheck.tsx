import { useState } from 'react';

const OBLASTS = [
  { key: 'abai', label: 'область Абай' },
  { key: 'akmolinsk', label: 'Акмолинская область' },
  { key: 'aktobe', label: 'Актюбинская область' },
  { key: 'almaty_obl', label: 'Алматинская область' },
  { key: 'atyrau', label: 'Атырауская область' },
  { key: 'east_kz', label: 'Восточно-Казахстанская область' },
  { key: 'zhambyl', label: 'Жамбылская область' },
  { key: 'west_kz', label: 'Западно-Казахстанская область' },
  { key: 'karaganda', label: 'Карагандинская область' },
  { key: 'kostanay', label: 'Костанайская область' },
  { key: 'kyzylorda', label: 'Кызылординская область' },
  { key: 'mangystau', label: 'Мангистауская область' },
  { key: 'pavlodar', label: 'Павлодарская область' },
  { key: 'north_kz', label: 'Северо-Казахстанская область' },
  { key: 'turkestan', label: 'Туркестанская область' },
  { key: 'shymkent', label: 'г.Шымкент' },
  { key: 'zhetysu', label: 'область Жетісу' },
  { key: 'ulytau', label: 'область Ұлытау' },
];

const DIRECTIONS = [
  { key: 'cattle', label: 'Скотоводство (КРС)' },
  { key: 'dairy', label: 'Молочное скотоводство' },
  { key: 'sheep', label: 'Овцеводство' },
  { key: 'poultry', label: 'Птицеводство' },
  { key: 'horses', label: 'Коневодство' },
  { key: 'breeding', label: 'Племенное животноводство' },
  { key: 'pigs', label: 'Свиноводство' },
  { key: 'camels', label: 'Верблюдоводство' },
];

const FOOD_SECURITY: Record<string, number> = {
  poultry: 1.0, dairy: 0.8, meat: 0.7, cattle: 0.6, sheep: 0.5,
  horses: 0.4, breeding: 0.7, pigs: 0.3, camels: 0.3, other: 0.3,
};

// Simplified scoring logic matching pipeline/score.py
function calculateScore(params: {
  oblast: string;
  direction: string;
  amount: number;
  isBreeding: boolean;
  retryCount: number;
  isWeekend: boolean;
}) {
  const { oblast, direction, amount, isBreeding, retryCount, isWeekend } = params;

  // Strategic Alignment
  const fs = FOOD_SECURITY[direction] || 0.3;
  const priorityBonus = isBreeding ? 30 : 15;
  const specScore = 20; // neutral without real regional data
  const strategic = specScore + priorityBonus + fs * 30;

  // Fairness Factor
  let sizeScore = 30;
  if (amount < 1_000_000) sizeScore = 30;
  else if (amount < 5_000_000) sizeScore = 22;
  else if (amount < 20_000_000) sizeScore = 12;
  else sizeScore = 5;
  const fairness = 25 + 25 + sizeScore; // neutral monopoly + neutral median

  // Regional Need
  const need = 18 + 12 + 12 + 16; // neutral factors

  // Efficiency
  let historyScore = 30;
  if (retryCount === 0) historyScore = 30;
  else if (retryCount === 1) historyScore = 35;
  else if (retryCount <= 3) historyScore = 22;
  else historyScore = 10;
  const efficiency = historyScore + 32 + 25; // neutral district + neutral amount

  // Fraud Risk
  let fraud = 0;
  if (amount > 0 && amount % 1_000_000 === 0) fraud += 15;
  else if (amount > 0 && amount % 100_000 === 0) fraud += 5;
  if (isWeekend) fraud += 8;
  if (retryCount > 5) fraud += 20;
  else if (retryCount > 3) fraud += 12;

  const base = 0.20 * strategic + 0.20 * fairness + 0.20 * need + 0.20 * efficiency + 0.10 * 50;
  const penalty = 0.10 * fraud;
  const score = Math.max(0, base - penalty);

  return {
    score: Math.round(score * 10) / 10,
    components: {
      strategic: Math.round(strategic * 10) / 10,
      fairness: Math.round(fairness * 10) / 10,
      need: Math.round(need * 10) / 10,
      efficiency: Math.round(efficiency * 10) / 10,
      fraud: Math.round(fraud * 10) / 10,
    },
    explanations: generateExplanations(params, strategic, fairness, need, efficiency, fraud),
  };
}

function generateExplanations(
  params: { direction: string; amount: number; isBreeding: boolean; retryCount: number; isWeekend: boolean },
  strategic: number, fairness: number, need: number, efficiency: number, fraud: number
): string[] {
  const tips: string[] = [];

  if (strategic < 60) tips.push('💡 Переход на приоритетное направление (племенное, молоко) → +15 баллов к Strategic');
  if (params.amount > 20_000_000) tips.push('⚠️ Крупная сумма снижает Fairness. Рассмотрите разбивку на несколько заявок');
  if (params.retryCount > 3) tips.push('⚠️ Много повторных подач снижает Efficiency и увеличивает Fraud Risk');
  if (params.isWeekend) tips.push('💡 Подача в будний день уберёт −8 к Fraud Risk');
  if (params.amount > 0 && params.amount % 1_000_000 === 0) tips.push('💡 Некруглая сумма уберёт −15 к Fraud Risk');
  if (fraud === 0) tips.push('✅ Нет fraud-аномалий — отлично!');
  if (params.isBreeding) tips.push('✅ Племенное направление — приоритет Концепции АПК 2021-2030');
  if (params.amount < 5_000_000) tips.push('✅ Мелкий фермер — бонус к Fairness');

  return tips;
}

function ComponentBar({ label, value, max = 100, color }: { label: string; value: number; max?: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 w-20 text-right">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-3 relative">
        <div className={`${color} h-3 rounded-full`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-300 w-10 text-right">{value}</span>
    </div>
  );
}

export default function PreCheck() {
  const [oblast, setOblast] = useState('abai');
  const [direction, setDirection] = useState('cattle');
  const [amount, setAmount] = useState(3000000);
  const [isBreeding, setIsBreeding] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isWeekend, setIsWeekend] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof calculateScore> | null>(null);

  const handleCalculate = () => {
    setResult(calculateScore({ oblast, direction, amount, isBreeding, retryCount, isWeekend }));
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-2">Pre-Check: Проверь свою заявку</h3>
      <p className="text-slate-400 text-sm mb-5">Узнайте предварительный балл заявки до подачи</p>

      <div className="grid md:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Область</label>
          <select
            value={oblast}
            onChange={(e) => setOblast(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            {OBLASTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Направление</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            {DIRECTIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Сумма заявки (₸)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            min={0}
            step={100000}
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Повторных подач ранее</label>
          <input
            type="number"
            value={retryCount}
            onChange={(e) => setRetryCount(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            min={0}
            max={20}
          />
        </div>
      </div>

      <div className="flex gap-4 mb-5">
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isBreeding}
            onChange={(e) => setIsBreeding(e.target.checked)}
            className="accent-emerald-500"
          />
          Племенное направление
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={isWeekend}
            onChange={(e) => setIsWeekend(e.target.checked)}
            className="accent-emerald-500"
          />
          Подача в выходной
        </label>
      </div>

      <button
        onClick={handleCalculate}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-lg transition mb-5"
      >
        Рассчитать Impact Score
      </button>

      {result && (
        <div className="space-y-4">
          {/* Score */}
          <div className="text-center py-4 bg-slate-800/50 rounded-xl">
            <div className={`text-5xl font-bold ${result.score >= 60 ? 'text-emerald-400' : result.score >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {result.score}
            </div>
            <div className="text-slate-400 text-sm mt-1">Impact Score из 100</div>
          </div>

          {/* Components */}
          <div className="space-y-2">
            <ComponentBar label="Strategic" value={result.components.strategic} color="bg-sky-500" />
            <ComponentBar label="Fairness" value={result.components.fairness} color="bg-violet-500" />
            <ComponentBar label="Need" value={result.components.need} color="bg-amber-500" />
            <ComponentBar label="Efficiency" value={result.components.efficiency} color="bg-emerald-500" />
            <ComponentBar label="Fraud" value={result.components.fraud} color="bg-red-500" />
          </div>

          {/* Explanations */}
          <div className="bg-slate-800/30 rounded-lg p-4">
            <div className="text-xs text-slate-400 mb-2 font-medium">Рекомендации</div>
            <div className="space-y-1.5">
              {result.explanations.map((tip, i) => (
                <div key={i} className="text-sm text-slate-300">{tip}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
