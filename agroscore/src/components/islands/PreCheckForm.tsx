import { createSignal, createEffect, Show, For } from 'solid-js';
import { runPreCheck } from '../../lib/scoring/impact-score';
import type { PreCheckInput, PreCheckResult, PreCheckIssue, Recommendation } from '../../lib/types';

const OBLASTS = [
  'Алматинская область',
  'Туркестанская область',
  'Жамбылская область',
  'Кызылординская область',
  'Восточно-Казахстанская область',
  'Северо-Казахстанская область',
  'Акмолинская область',
  'Костанайская область',
  'Павлодарская область',
  'Карагандинская область',
  'Западно-Казахстанская область',
  'Актюбинская область',
  'Атырауская область',
  'Мангистауская область',
  'Улытауская область',
  'Абай область',
  'Жетісу область'
];

const SUBSIDY_TYPES = [
  { code: '00400', name: 'Покупка маточного поголовья КРС' },
  { code: '00401', name: 'Покупка племенных баранов-производителей' },
  { code: '00100', name: 'Производство молока' },
  { code: '00200', name: 'Племенное животноводство' },
  { code: '00300', name: 'Повышение продуктивности' },
];

function CircularGauge(props: { score: number; size?: number }) {
  const size = props.size || 180;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = createSignal(circumference);
  
  createEffect(() => {
    const progress = props.score / 100;
    setTimeout(() => {
      setOffset(circumference - (progress * circumference));
    }, 100);
  });
  
  const getScoreColor = () => {
    if (props.score >= 80) return '#0d9488';
    if (props.score >= 60) return '#1e3a5f';
    if (props.score >= 40) return '#d4a436';
    return '#dc2626';
  };
  
  return (
    <div class="relative inline-flex items-center justify-center">
      <svg width={size} height={size} class="transform -rotate-90">
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={`stop-color: ${getScoreColor()}; stop-opacity: 1`} />
            <stop offset="100%" style={`stop-color: ${getScoreColor()}; stop-opacity: 0.6`} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e7e5e4"
          stroke-width={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#scoreGradient)"
          stroke-width={strokeWidth}
          fill="none"
          stroke-linecap="round"
          stroke-dasharray={String(circumference)}
          stroke-dashoffset={offset()}
          style="transition: stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1);"
        />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <span class="stat-number-xl" style={`color: ${getScoreColor()};`}>{props.score}</span>
        <span class="text-sm font-medium" style="color: #627d98;">из 100</span>
      </div>
    </div>
  );
}

export default function PreCheckForm() {
  const [formData, setFormData] = createSignal<PreCheckInput>({
    oblast: '',
    district: '',
    subsidy_code: '',
    volume: 0,
    sum: 0,
    month: new Date().getMonth() + 1
  });
  
  const [result, setResult] = createSignal<PreCheckResult | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [showResult, setShowResult] = createSignal(false);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate async processing
    setTimeout(() => {
      const checkResult = runPreCheck(formData());
      setResult(checkResult);
      setShowResult(true);
      setIsLoading(false);
    }, 500);
  };

  const updateField = <K extends keyof PreCheckInput>(field: K, value: PreCheckInput[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setShowResult(false);
    setResult(null);
  };

  return (
    <div class="space-y-8">
      <Show when={!showResult()}>
        {/* Form - Premium Glass Card */}
        <form onSubmit={handleSubmit} class="glass-card rounded-3xl p-8 md:p-10" style="border-left: 5px solid #1e3a5f;">
          <div class="mb-8">
            <h2 class="text-xl font-bold" style="color: #1e3a5f;">Данные заявки</h2>
            <p class="text-sm mt-1" style="color: #627d98;">Заполните информацию для предварительной проверки</p>
          </div>
          
          <div class="grid md:grid-cols-2 gap-6">
            {/* Oblast */}
            <div>
              <label class="block text-sm font-bold uppercase tracking-wider mb-3" style="color: #627d98;">
                Область
              </label>
              <select
                value={formData().oblast}
                onChange={(e) => updateField('oblast', e.currentTarget.value)}
                required
                class="select-premium"
              >
                <option value="">Выберите область</option>
                <For each={OBLASTS}>
                  {(oblast) => <option value={oblast}>{oblast}</option>}
                </For>
              </select>
            </div>
            
            {/* District */}
            <div>
              <label class="block text-sm font-bold uppercase tracking-wider mb-3" style="color: #627d98;">
                Район
              </label>
              <input
                type="text"
                value={formData().district}
                onInput={(e) => updateField('district', e.currentTarget.value)}
                placeholder="Например: Енбекшиказахский"
                required
                class="input-premium"
              />
            </div>
            
            {/* Subsidy Type */}
            <div class="md:col-span-2">
              <label class="block text-sm font-bold uppercase tracking-wider mb-3" style="color: #627d98;">
                Вид субсидии
              </label>
              <select
                value={formData().subsidy_code}
                onChange={(e) => updateField('subsidy_code', e.currentTarget.value)}
                required
                class="select-premium"
              >
                <option value="">Выберите вид субсидии</option>
                <For each={SUBSIDY_TYPES}>
                  {(type) => <option value={type.code}>{type.name}</option>}
                </For>
              </select>
            </div>
            
            {/* Volume */}
            <div>
              <label class="block text-sm font-bold uppercase tracking-wider mb-3" style="color: #627d98;">
                Объём (голов/литров)
              </label>
              <input
                type="number"
                value={formData().volume || ''}
                onInput={(e) => updateField('volume', parseInt(e.currentTarget.value) || 0)}
                placeholder="Например: 50"
                min="1"
                required
                class="input-premium"
              />
            </div>
            
            {/* Sum */}
            <div>
              <label class="block text-sm font-bold uppercase tracking-wider mb-3" style="color: #627d98;">
                Сумма субсидии (тенге)
              </label>
              <input
                type="number"
                value={formData().sum || ''}
                onInput={(e) => updateField('sum', parseInt(e.currentTarget.value) || 0)}
                placeholder="Например: 2500000"
                min="1"
                required
                class="input-premium"
              />
            </div>
          </div>
          
          <div class="mt-10">
            <button
              type="submit"
              disabled={isLoading()}
              class="btn-premium btn-premium-gold w-full md:w-auto"
            >
              <Show when={isLoading()} fallback={
                <>
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Проверить заявку
                </>
              }>
                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Проверяем...
              </Show>
            </button>
          </div>
        </form>
      </Show>
      
      {/* Results */}
      <Show when={showResult() && result()}>
        <div class="space-y-6 animate-fade-in-up">
          {/* Status Card - Premium */}
          <div 
            class="card-premium rounded-3xl p-8 md:p-10"
            style={result()!.eligible 
              ? "border-left: 5px solid #0d9488; background: linear-gradient(135deg, rgba(13, 148, 136, 0.08) 0%, rgba(13, 148, 136, 0.02) 100%);" 
              : "border-left: 5px solid #dc2626; background: linear-gradient(135deg, rgba(220, 38, 38, 0.08) 0%, rgba(220, 38, 38, 0.02) 100%);"}
          >
            <div class="flex items-center gap-6">
              <div 
                class="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={result()!.eligible 
                  ? "background: linear-gradient(135deg, rgba(13, 148, 136, 0.2) 0%, rgba(13, 148, 136, 0.1) 100%); box-shadow: 0 4px 14px rgba(13, 148, 136, 0.3);" 
                  : "background: linear-gradient(135deg, rgba(220, 38, 38, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%); box-shadow: 0 4px 14px rgba(220, 38, 38, 0.3);"}
              >
                <Show when={result()!.eligible} fallback={
                  <svg class="w-8 h-8" style="color: #dc2626;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                }>
                  <svg class="w-8 h-8" style="color: #0d9488;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </Show>
              </div>
              <div class="flex-1">
                <h2 class="text-2xl font-bold" style={result()!.eligible ? "color: #0f766e;" : "color: #991b1b;"}>
                  {result()!.eligible ? 'Заявка может быть подана' : 'Есть блокирующие проблемы'}
                </h2>
                <p class="mt-2 text-sm" style={result()!.eligible ? "color: #0d9488;" : "color: #dc2626;"}>
                  {result()!.eligible 
                    ? 'По предварительной оценке, заявка соответствует требованиям программы субсидирования' 
                    : 'Необходимо исправить указанные проблемы перед официальной подачей заявки'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Score Card - Premium with Circular Gauge */}
          <div class="card-premium rounded-3xl p-8 md:p-10">
            <div class="flex flex-col md:flex-row items-center gap-8">
              <div class="flex-shrink-0">
                <CircularGauge score={result()!.estimated_score} size={200} />
              </div>
              <div class="flex-1 text-center md:text-left">
                <h3 class="text-sm font-bold uppercase tracking-wider mb-2" style="color: #627d98;">Impact Score</h3>
                <p class="text-lg mb-6" style="color: #44403c;">
                  Ваша заявка оценена на основе 6 компонентов: эффективность, справедливость, региональные потребности, сезонность, объём и история.
                </p>
                <div class="inline-flex items-center gap-3 px-5 py-3 rounded-xl" style="background: rgba(30, 58, 95, 0.08);">
                  <svg class="w-5 h-5" style="color: #1e3a5f;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span class="font-semibold" style="color: #1e3a5f;">
                    Примерный рейтинг: <span class="gradient-text-navy">#{result()!.estimated_rank}</span> из ~2,854 заявок
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Issues */}
          <Show when={result()!.issues.length > 0}>
            <div class="card-premium rounded-3xl p-8 md:p-10">
              <h3 class="text-lg font-bold mb-6" style="color: #1e3a5f;">Обнаруженные проблемы</h3>
              <div class="space-y-4">
                <For each={result()!.issues}>
                  {(issue: PreCheckIssue) => (
                    <div 
                      class="p-5 rounded-2xl transition-all hover-lift"
                      style={issue.severity === 'blocking' 
                        ? "background: linear-gradient(135deg, rgba(220, 38, 38, 0.08) 0%, rgba(220, 38, 38, 0.02) 100%); border: 1px solid rgba(220, 38, 38, 0.15);" 
                        : "background: linear-gradient(135deg, rgba(212, 164, 54, 0.1) 0%, rgba(212, 164, 54, 0.02) 100%); border: 1px solid rgba(212, 164, 54, 0.2);"}
                    >
                      <div class="flex items-start gap-4">
                        <div 
                          class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={issue.severity === 'blocking' 
                            ? "background: linear-gradient(135deg, rgba(220, 38, 38, 0.2) 0%, rgba(220, 38, 38, 0.1) 100%);" 
                            : "background: linear-gradient(135deg, rgba(212, 164, 54, 0.2) 0%, rgba(212, 164, 54, 0.1) 100%);"}
                        >
                          <Show when={issue.severity === 'blocking'} fallback={
                            <svg class="w-5 h-5" style="color: #a16207;" fill="currentColor" viewBox="0 0 20 20">
                              <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                            </svg>
                          }>
                            <svg class="w-5 h-5" style="color: #dc2626;" fill="currentColor" viewBox="0 0 20 20">
                              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                            </svg>
                          </Show>
                        </div>
                        <div class="flex-1">
                          <p class="font-semibold" style={issue.severity === 'blocking' ? "color: #991b1b;" : "color: #854d0e;"}>
                            {issue.message}
                          </p>
                          <div class="flex items-center gap-2 mt-2 p-3 rounded-lg" style="background: rgba(255,255,255,0.5);">
                            <svg class="w-4 h-4 flex-shrink-0" style="color: #0d9488;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                            <p class="text-sm" style="color: #0f766e;">{issue.fix}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
          
          {/* Recommendations */}
          <Show when={result()!.recommendations.length > 0}>
            <div class="card-premium rounded-3xl p-8 md:p-10">
              <h3 class="text-lg font-bold mb-6" style="color: #1e3a5f;">Рекомендации для улучшения</h3>
              <div class="space-y-4">
                <For each={result()!.recommendations}>
                  {(rec: Recommendation) => (
                    <div class="flex items-start gap-4 p-5 rounded-2xl hover-lift transition-all" style="background: linear-gradient(135deg, rgba(13, 148, 136, 0.06) 0%, rgba(13, 148, 136, 0.02) 100%); border: 1px solid rgba(13, 148, 136, 0.1);">
                      <div class="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style="background: linear-gradient(135deg, rgba(13, 148, 136, 0.15) 0%, rgba(13, 148, 136, 0.05) 100%);">
                        <span class="text-xl font-bold" style="color: #0d9488;">+{rec.score_increase}</span>
                      </div>
                      <div class="flex-1">
                        <p class="font-semibold" style="color: #1e3a5f;">{rec.action}</p>
                        <p class="text-sm mt-1" style="color: #627d98;">{rec.description}</p>
                        <div class="mt-3">
                          <span 
                            class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
                            style={
                              rec.difficulty === 'easy' 
                                ? "background: linear-gradient(135deg, rgba(13, 148, 136, 0.15) 0%, rgba(13, 148, 136, 0.1) 100%); color: #0f766e;" 
                                : rec.difficulty === 'medium' 
                                ? "background: linear-gradient(135deg, rgba(212, 164, 54, 0.15) 0%, rgba(212, 164, 54, 0.1) 100%); color: #a16207;"
                                : "background: linear-gradient(135deg, rgba(220, 38, 38, 0.15) 0%, rgba(220, 38, 38, 0.1) 100%); color: #dc2626;"
                            }
                          >
                            {rec.difficulty === 'easy' ? '✓ Легко' : rec.difficulty === 'medium' ? '◐ Средне' : '⚠ Сложно'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
          
          {/* Back Button */}
          <button
            onClick={resetForm}
            class="btn-premium btn-premium-navy w-full md:w-auto"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Проверить другую заявку
          </button>
        </div>
      </Show>
    </div>
  );
}
