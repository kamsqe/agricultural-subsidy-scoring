import { createSignal, createMemo, createEffect, For } from 'solid-js';

interface SimulationResult {
  strategy: string;
  funded_count: number;
  total_allocated: number;
  gini: number;
  small_farmer_share: number;
  monopoly_districts: number;
}

const MOCK_RESULTS: Record<string, Record<number, SimulationResult>> = {
  fifo: {
    20: { strategy: 'fifo', funded_count: 493, total_allocated: 19.8e9, gini: 0.71, small_farmer_share: 0.21, monopoly_districts: 14 },
    40: { strategy: 'fifo', funded_count: 987, total_allocated: 39.5e9, gini: 0.69, small_farmer_share: 0.23, monopoly_districts: 12 },
    60: { strategy: 'fifo', funded_count: 1480, total_allocated: 59.2e9, gini: 0.68, small_farmer_share: 0.24, monopoly_districts: 11 },
    80: { strategy: 'fifo', funded_count: 1973, total_allocated: 78.9e9, gini: 0.67, small_farmer_share: 0.25, monopoly_districts: 10 },
    100: { strategy: 'fifo', funded_count: 2467, total_allocated: 98.5e9, gini: 0.66, small_farmer_share: 0.26, monopoly_districts: 9 },
  },
  merit: {
    20: { strategy: 'merit', funded_count: 739, total_allocated: 19.9e9, gini: 0.55, small_farmer_share: 0.31, monopoly_districts: 5 },
    40: { strategy: 'merit', funded_count: 1478, total_allocated: 39.8e9, gini: 0.53, small_farmer_share: 0.33, monopoly_districts: 4 },
    60: { strategy: 'merit', funded_count: 2218, total_allocated: 59.7e9, gini: 0.52, small_farmer_share: 0.34, monopoly_districts: 4 },
    80: { strategy: 'merit', funded_count: 2957, total_allocated: 79.6e9, gini: 0.51, small_farmer_share: 0.35, monopoly_districts: 3 },
    100: { strategy: 'merit', funded_count: 3696, total_allocated: 99.5e9, gini: 0.50, small_farmer_share: 0.36, monopoly_districts: 3 },
  },
};

function formatBudget(value: number): string {
  return `${value} млрд ₸`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function AnimatedNumber(props: { value: number; prefix?: string; suffix?: string; class?: string }) {
  const [displayValue, setDisplayValue] = createSignal(0);
  
  createEffect(() => {
    const target = props.value;
    const duration = 800;
    const startTime = Date.now();
    const startValue = displayValue();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(startValue + (target - startValue) * easeOut));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  });
  
  return (
    <span class={props.class}>
      {props.prefix}{displayValue()}{props.suffix}
    </span>
  );
}

export default function BudgetSimulator() {
  const [budget, setBudget] = createSignal(50);
  const [strategy, setStrategy] = createSignal<'fifo' | 'merit'>('merit');
  
  const budgetLevel = createMemo(() => {
    const b = budget();
    if (b <= 20) return 20;
    if (b <= 40) return 40;
    if (b <= 60) return 60;
    if (b <= 80) return 80;
    return 100;
  });
  
  const fifoResult = createMemo(() => MOCK_RESULTS.fifo[budgetLevel()]);
  const meritResult = createMemo(() => MOCK_RESULTS.merit[budgetLevel()]);
  const currentResult = createMemo(() => strategy() === 'fifo' ? fifoResult() : meritResult());
  
  const fundedDelta = createMemo(() => {
    const merit = meritResult().funded_count;
    const fifo = fifoResult().funded_count;
    return Math.round((merit - fifo) / fifo * 100);
  });
  
  const giniDelta = createMemo(() => {
    const merit = meritResult().gini;
    const fifo = fifoResult().gini;
    return Math.round((merit - fifo) / fifo * 100);
  });
  
  const smallFarmerDelta = createMemo(() => {
    const merit = meritResult().small_farmer_share;
    const fifo = fifoResult().small_farmer_share;
    return Math.round((merit - fifo) / fifo * 100);
  });

  return (
    <div class="space-y-8">
      {/* Controls - Premium Glass Card with Gradient Border */}
      <div class="card-3d card-gradient-border rounded-3xl p-10" style="border-top: 4px solid #1e3a5f;">
        <div class="grid md:grid-cols-2 gap-12">
          {/* Budget Slider - HUGE Display */}
          <div>
            <div class="flex items-center justify-between mb-6">
              <label class="text-sm font-bold uppercase tracking-wider" style="color: #627d98;">
                Бюджет
              </label>
              <div class="flex items-baseline gap-2">
                <span class="stat-dramatic gradient-text-gold text-glow-gold">{budget()}</span>
                <span class="text-2xl font-bold" style="color: #a16207;">млрд ₸</span>
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="10"
              value={budget()}
              onInput={(e) => setBudget(parseInt(e.currentTarget.value))}
              class="slider-premium w-full"
            />
            <div class="flex justify-between text-xs font-medium mt-3" style="color: #627d98;">
              <span>10 млрд</span>
              <span>50 млрд</span>
              <span>100 млрд</span>
            </div>
          </div>
          
          {/* Strategy Toggle - Premium */}
          <div>
            <label class="block text-sm font-bold uppercase tracking-wider mb-4" style="color: #627d98;">
              Стратегия распределения
            </label>
            <div class="flex gap-3">
              <button
                onClick={() => setStrategy('fifo')}
                class={`flex-1 px-6 py-4 rounded-xl text-sm font-bold transition-all duration-300 ${
                  strategy() === 'fifo' 
                    ? 'btn-premium-navy' 
                    : 'hover:bg-stone-100'
                }`}
                style={strategy() !== 'fifo' ? "background: #f5f5f4; color: #627d98;" : ""}
              >
                <div class="flex items-center justify-center gap-2">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  FIFO
                </div>
              </button>
              <button
                onClick={() => setStrategy('merit')}
                class={`flex-1 px-6 py-4 rounded-xl text-sm font-bold transition-all duration-300 ${
                  strategy() === 'merit' 
                    ? 'btn-premium-teal animate-pulse-glow' 
                    : 'hover:bg-stone-100'
                }`}
                style={strategy() !== 'merit' ? "background: #f5f5f4; color: #627d98;" : ""}
              >
                <div class="flex items-center justify-center gap-2">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Merit-based
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Results Comparison - 3D Cards with Winner/Loser States */}
      <div class="grid md:grid-cols-2 gap-8">
        {/* FIFO Card - Loser when not selected */}
        <div 
          class={`card-3d rounded-3xl p-8 transition-all duration-500 ${strategy() === 'fifo' ? 'hover:shadow-glow-navy-strong' : 'opacity-60 grayscale-[0.2]'}`}
          style={strategy() === 'fifo' 
            ? "border-top: 5px solid #1e3a5f; transform: scale(1.02);" 
            : "border-top: 5px solid #e7e5e4; border-left: 4px solid #dc2626;"}
        >
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background: linear-gradient(135deg, rgba(30, 58, 95, 0.15) 0%, rgba(30, 58, 95, 0.05) 100%);">
              <svg class="w-6 h-6" style="color: #1e3a5f;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-bold" style="color: #1e3a5f;">FIFO</h3>
              <span class="text-xs font-medium" style="color: #627d98;">Текущая система</span>
            </div>
          </div>
          
          <div class="space-y-6">
            <div>
              <div class="stat-number-xl gradient-text-navy">
                <AnimatedNumber value={fifoResult().funded_count} />
              </div>
              <div class="text-sm font-medium mt-1" style="color: #627d98;">Профинансировано фермеров</div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="p-4 rounded-xl" style="background: rgba(30, 58, 95, 0.05);">
                <div class="text-2xl font-bold" style="color: #1e3a5f;">{fifoResult().gini.toFixed(2)}</div>
                <div class="text-xs font-medium" style="color: #627d98;">Коэффициент Gini</div>
              </div>
              <div class="p-4 rounded-xl" style="background: rgba(30, 58, 95, 0.05);">
                <div class="text-2xl font-bold" style="color: #1e3a5f;">{formatPercent(fifoResult().small_farmer_share)}</div>
                <div class="text-xs font-medium" style="color: #627d98;">Мелким фермерам</div>
              </div>
            </div>
            <div class="p-4 rounded-xl" style="background: rgba(220, 38, 38, 0.05); border: 1px solid rgba(220, 38, 38, 0.1);">
              <div class="flex items-center gap-2">
                <svg class="w-5 h-5" style="color: #dc2626;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span class="text-2xl font-bold" style="color: #dc2626;">{fifoResult().monopoly_districts}</span>
                <span class="text-sm font-medium" style="color: #991b1b;">монопольных районов</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Merit Card - Winner with Glow */}
        <div 
          class={`card-3d rounded-3xl p-8 transition-all duration-500 relative overflow-hidden ${strategy() === 'merit' ? 'shadow-glow-teal-strong' : 'opacity-60'}`}
          style={strategy() === 'merit' 
            ? "border-top: 5px solid #0d9488; border: 2px solid rgba(13, 148, 136, 0.3); transform: scale(1.02);" 
            : "border-top: 5px solid #e7e5e4;"}
        >
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background: linear-gradient(135deg, rgba(13, 148, 136, 0.2) 0%, rgba(13, 148, 136, 0.05) 100%);">
              <svg class="w-6 h-6" style="color: #0d9488;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h3 class="text-lg font-bold" style="color: #0d9488;">Merit-based</h3>
              <span class="text-xs font-medium" style="color: #627d98;">Рекомендуемая</span>
            </div>
            <span class="ml-auto px-3 py-1.5 rounded-full text-xs font-bold animate-pulse" style="background: linear-gradient(135deg, rgba(212, 164, 54, 0.2) 0%, rgba(212, 164, 54, 0.1) 100%); color: #a16207; border: 1px solid rgba(212, 164, 54, 0.3);">
              ✦ ЛУЧШИЙ ВЫБОР
            </span>
          </div>
          
          <div class="space-y-6">
            <div>
              <div class="stat-number-xl gradient-text-teal">
                <AnimatedNumber value={meritResult().funded_count} />
              </div>
              <div class="text-sm font-medium mt-1" style="color: #627d98;">Профинансировано фермеров</div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="p-4 rounded-xl" style="background: rgba(13, 148, 136, 0.08);">
                <div class="text-2xl font-bold" style="color: #0d9488;">{meritResult().gini.toFixed(2)}</div>
                <div class="text-xs font-medium" style="color: #627d98;">Коэффициент Gini</div>
              </div>
              <div class="p-4 rounded-xl" style="background: rgba(13, 148, 136, 0.08);">
                <div class="text-2xl font-bold" style="color: #0d9488;">{formatPercent(meritResult().small_farmer_share)}</div>
                <div class="text-xs font-medium" style="color: #627d98;">Мелким фермерам</div>
              </div>
            </div>
            <div class="p-4 rounded-xl" style="background: rgba(13, 148, 136, 0.08); border: 1px solid rgba(13, 148, 136, 0.15);">
              <div class="flex items-center gap-2">
                <svg class="w-5 h-5" style="color: #0d9488;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-2xl font-bold" style="color: #0d9488;">{meritResult().monopoly_districts}</span>
                <span class="text-sm font-medium" style="color: #0f766e;">монопольных районов</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Delta Summary - Clean design without laggy animations */}
      <div class="relative rounded-3xl p-12 overflow-hidden" style="background: linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%);">
        
        <div class="relative z-10">
          <div class="text-center mb-10">
            <div class="inline-flex items-center gap-3 rounded-full px-5 py-2.5 mb-4" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);">
              <span class="w-2 h-2 rounded-full" style="background: #2dd4bf; box-shadow: 0 0 10px #2dd4bf;"></span>
              <span class="text-xs font-bold uppercase tracking-wider text-white/70">Эффект Merit-based</span>
            </div>
            <h3 class="text-2xl font-bold text-glow mb-2" style="color: #fff;">
              При бюджете <span style="color: #f5d76e;">{formatBudget(budget())}</span>
            </h3>
            <p class="text-white/60 text-sm">Сравнение с текущей FIFO системой</p>
          </div>
          
          <div class="grid md:grid-cols-3 gap-6">
            {/* Funded Farmers Delta */}
            <div class="text-center p-6 rounded-2xl" style="background: rgba(13, 148, 136, 0.2); border: 1px solid rgba(13, 148, 136, 0.4);">
              <div class="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style="background: rgba(13, 148, 136, 0.3);">
                <svg class="w-6 h-6" style="color: #2dd4bf;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                </svg>
              </div>
              <div class="text-4xl font-black" style="color: #2dd4bf;">
                +<AnimatedNumber value={fundedDelta()} />%
              </div>
              <div class="text-sm font-bold mt-2 text-white">Больше фермеров</div>
              <div class="text-xs mt-1 text-white/50">получат финансирование</div>
            </div>
            
            {/* Gini Delta */}
            <div class="text-center p-6 rounded-2xl" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);">
              <div class="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style="background: rgba(255, 255, 255, 0.1);">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                </svg>
              </div>
              <div class="text-4xl font-black text-white">
                <AnimatedNumber value={giniDelta()} />%
              </div>
              <div class="text-sm font-bold mt-2 text-white">Снижение Gini</div>
              <div class="text-xs mt-1 text-white/50">более равномерное распределение</div>
            </div>
            
            {/* Small Farmers Delta */}
            <div class="text-center p-6 rounded-2xl" style="background: rgba(212, 164, 54, 0.2); border: 1px solid rgba(212, 164, 54, 0.4);">
              <div class="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center" style="background: rgba(212, 164, 54, 0.3);">
                <svg class="w-6 h-6" style="color: #fde047;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                </svg>
              </div>
              <div class="text-4xl font-black" style="color: #fde047;">
                +<AnimatedNumber value={smallFarmerDelta()} />%
              </div>
              <div class="text-sm font-bold mt-2 text-white">Мелким фермерам</div>
              <div class="text-xs mt-1 text-white/50">доля бюджета</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
