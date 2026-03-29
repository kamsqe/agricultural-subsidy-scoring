# Архитектура AgroScore: Полная техническая спецификация

Детальное описание архитектуры системы: компоненты, data flow, API contracts, структура файлов, deployment pipeline.

---

## Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              ПОЛЬЗОВАТЕЛИ                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Фермер    │  │  Инспектор  │  │  Комиссия   │  │  Аналитик   │     │
│  │  (Pre-Check)│  │  (Dashboard)│  │  (Ranking)  │  │  (Deep dive)│     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
└─────────┼────────────────┼────────────────┼────────────────┼────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE EDGE                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Cloudflare Pages (CDN)                        │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │                    ASTRO 5.x (SSG)                       │    │    │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │    │
│  │  │  │  index   │ │simulator │ │dashboard │ │  precheck│    │    │    │
│  │  │  │  .astro  │ │  .astro  │ │  .astro  │ │  .astro  │    │    │    │
│  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘    │    │    │
│  │  │       │            │            │            │          │    │    │
│  │  │       ▼            ▼            ▼            ▼          │    │    │
│  │  │  ┌─────────────────────────────────────────────────┐    │    │    │
│  │  │  │              INTERACTIVE ISLANDS                 │    │    │    │
│  │  │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │    │    │    │
│  │  │  │  │Particle│ │  Map   │ │Scoring │ │  Chat  │    │    │    │    │
│  │  │  │  │  Flow  │ │  SVG   │ │  Table │ │  LLM   │    │    │    │    │
│  │  │  │  └────────┘ └────────┘ └────────┘ └────────┘    │    │    │    │
│  │  │  └─────────────────────────────────────────────────┘    │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Cloudflare Workers (API)                      │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │    │
│  │  │/api/score│ │/api/sim  │ │/api/chat │ │/api/expln│            │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │    │
│  │       │            │            │            │                   │    │
│  │       ▼            ▼            ▼            ▼                   │    │
│  │  ┌─────────────────────────────────────────────────────────┐    │    │
│  │  │                    Cloudflare KV                         │    │    │
│  │  │  Pre-computed: scores, SHAP, simulations, aggregates     │    │    │
│  │  └─────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ (build time only)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         ML PIPELINE (Python)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │  Extract │→│ Transform│→│  Train   │→│  Score   │→│  Export  │      │
│  │  (Excel) │ │ (Pandas) │ │(XGBoost) │ │  (SHAP)  │ │  (JSON)  │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Стек технологий (детально)

### Frontend

| Компонент | Технология | Версия | Обоснование |
|---|---|---|---|
| **Framework** | Astro | 5.x | SSG + Islands = минимальный JS, быстрая загрузка |
| **Islands** | Solid.js | 1.8+ | Реактивность без Virtual DOM, 7KB gzipped |
| **Визуализация** | D3.js | 7.x | Полный контроль над SVG/Canvas |
| **Canvas** | Native Canvas 2D | — | 36K частиц @ 60fps |
| **Карта** | Custom SVG | — | Точные границы районов КЗ |
| **Анимации** | GSAP | 3.x | ScrollTrigger для scrollytelling |
| **Стили** | Tailwind CSS | 4.x | Utility-first, tree-shaking |
| **Иконки** | Lucide | — | Консистентные, лёгкие |
| **Таблицы** | TanStack Table | 8.x | Виртуализация 36K строк |

### Backend / Edge

| Компонент | Технология | Обоснование |
|---|---|---|
| **Hosting** | Cloudflare Pages | Edge CDN, бесплатный tier |
| **API** | Cloudflare Workers | Serverless, <50ms latency |
| **Storage** | Cloudflare KV | Key-value для pre-computed данных |
| **LLM** | OpenAI API | GPT-4o-mini через Worker proxy |

### ML Pipeline

| Компонент | Технология | Обоснование |
|---|---|---|
| **Data** | Pandas 2.x | Обработка Excel |
| **ML** | XGBoost 2.x | Ансамбль моделей |
| **Explainability** | SHAP 0.44+ | Waterfall charts |
| **Simulation** | NumPy | What-If сценарии |
| **Export** | JSON | Статические данные для frontend |

---

## Data Flow

### 1. Build Time (ML Pipeline)

```
┌─────────────────────────────────────────────────────────────────┐
│                        BUILD PIPELINE                            │
│                                                                  │
│  Excel Dataset                                                   │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. EXTRACT                                               │    │
│  │    - Read Excel (36,651 rows)                            │    │
│  │    - Parse dates, codes, amounts                         │    │
│  │    - Validate schema                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 2. TRANSFORM                                             │    │
│  │    - Case-level deduplication (→ 23,851 cases)           │    │
│  │    - Feature engineering (11 features)                   │    │
│  │    - Aggregations (district, oblast, month)              │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 3. TRAIN                                                 │    │
│  │    - Split by subsidy category (4 models)                │    │
│  │    - XGBoost training                                    │    │
│  │    - Cross-validation                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 4. SCORE                                                 │    │
│  │    - Calculate Impact Score for all applications         │    │
│  │    - Generate SHAP values                                │    │
│  │    - Run simulations (FIFO vs Merit vs Uplift)           │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 5. EXPORT                                                │    │
│  │    - applications.json (36K records, ~5MB gzipped)       │    │
│  │    - aggregates.json (districts, oblasts, months)        │    │
│  │    - simulations.json (3 scenarios × budget levels)      │    │
│  │    - shap_values.json (top-10 features per app)          │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  src/lib/data/*.json → Astro build → Cloudflare Pages           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Runtime (User Interaction)

```
┌─────────────────────────────────────────────────────────────────┐
│                        RUNTIME FLOW                              │
│                                                                  │
│  User Action                                                     │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ A. STATIC DATA (instant, from CDN)                       │    │
│  │    - Initial page load                                   │    │
│  │    - Pre-computed scores                                 │    │
│  │    - Aggregates for charts                               │    │
│  │    - Map data                                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ B. DYNAMIC QUERIES (via Worker, <100ms)                  │    │
│  │    - Filter/sort applications                            │    │
│  │    - What-If simulation with custom params               │    │
│  │    - SHAP explanation for specific app                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ C. LLM QUERIES (via Worker → OpenAI, <2s)                │    │
│  │    - Natural language questions                          │    │
│  │    - Context: aggregates + top applications              │    │
│  │    - Streaming response                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Contracts

### POST /api/score

Расчёт Impact Score для новой заявки (Pre-Check).

```typescript
// Request
interface ScoreRequest {
  subsidy_code: string;      // "00400"
  oblast: string;            // "Алматинская область"
  district: string;          // "Енбекшиказахский район"
  volume: number;            // 150 (голов)
  sum: number;               // 22500000 (тенге)
  month: number;             // 3 (март)
}

// Response
interface ScoreResponse {
  impact_score: number;      // 72.4
  rank_estimate: number;     // ~450 из 2854
  components: {
    strategic_alignment: number;   // 65.2
    fairness_factor: number;       // 78.1
    regional_need: number;         // 82.3
    efficiency_potential: number;  // 64.0
  };
  eligibility: {
    passed: boolean;
    issues: Issue[];
  };
  top_factors: Factor[];
  recommendations: Recommendation[];
}

interface Issue {
  code: string;              // "NO_ISJ"
  severity: "blocking" | "warning";
  message: string;
  fix: string;
}

interface Factor {
  name: string;              // "Региональная специализация"
  contribution: number;      // +12.3
  direction: "positive" | "negative";
}

interface Recommendation {
  action: string;
  score_increase: number;
  difficulty: "easy" | "medium" | "hard";
}
```

### POST /api/simulate

What-If симуляция распределения бюджета.

```typescript
// Request
interface SimulateRequest {
  budget: number;            // 50_000_000_000 (50 млрд)
  strategy: "fifo" | "merit" | "uplift";
  weights?: {
    strategic: number;       // 0.25
    fairness: number;        // 0.25
    need: number;            // 0.25
    efficiency: number;      // 0.25
  };
  constraints?: {
    max_single_recipient: number;  // 0.15
    max_district: number;          // 0.10
    min_small_farmer: number;      // 0.30
  };
  filters?: {
    oblasts?: string[];
    subsidy_codes?: string[];
    min_volume?: number;
    max_volume?: number;
  };
}

// Response
interface SimulateResponse {
  funded_count: number;      // 1847
  total_allocated: number;   // 49_823_450_000
  metrics: {
    gini: number;            // 0.52
    regional_cv: number;     // 0.28
    small_farmer_share: number;  // 0.34
    monopoly_districts: number;  // 3
  };
  distribution: {
    by_oblast: Record<string, number>;
    by_subsidy_type: Record<string, number>;
    by_size_bucket: Record<string, number>;
  };
  top_funded: Application[];     // top 100
  comparison?: {
    vs_fifo: MetricsDelta;
    vs_current: MetricsDelta;
  };
}
```

### POST /api/explain

SHAP explanation для конкретной заявки.

```typescript
// Request
interface ExplainRequest {
  application_id: string;    // "01300100258072"
  level: "summary" | "detail" | "counterfactual";
}

// Response (level = "detail")
interface ExplainResponse {
  application_id: string;
  impact_score: number;
  base_value: number;        // 50.0
  shap_values: ShapValue[];
  waterfall_svg?: string;    // pre-rendered SVG
}

interface ShapValue {
  feature: string;           // "district_specialization_idx"
  value: number;             // 1.8
  shap: number;              // +12.3
  display_name: string;      // "Региональная специализация"
}
```

### POST /api/chat

LLM-ассистент с контекстом данных.

```typescript
// Request
interface ChatRequest {
  message: string;           // "Покажи топ-10 молочных ферм Туркестана"
  conversation_id?: string;
  context?: {
    current_filters?: Filters;
    selected_application?: string;
  };
}

// Response (streaming)
interface ChatResponse {
  conversation_id: string;
  chunks: AsyncIterable<{
    type: "text" | "chart" | "table" | "action";
    content: string | ChartData | TableData | Action;
  }>;
}

interface Action {
  type: "filter" | "navigate" | "highlight";
  params: Record<string, any>;
}
```

---

## Структура проекта (детально)

```
/
├── astro.config.mjs           # Astro config + Cloudflare adapter
├── tailwind.config.mjs        # Tailwind config
├── package.json
├── tsconfig.json
│
├── src/
│   ├── pages/
│   │   ├── index.astro        # Landing + Scrollytelling
│   │   ├── simulator.astro    # What-If Simulator
│   │   ├── dashboard.astro    # Scoring Dashboard
│   │   ├── precheck.astro     # Pre-Check для фермера
│   │   └── api/               # API routes (Workers)
│   │       ├── score.ts
│   │       ├── simulate.ts
│   │       ├── explain.ts
│   │       └── chat.ts
│   │
│   ├── components/
│   │   ├── astro/             # Static Astro components
│   │   │   ├── Header.astro
│   │   │   ├── Footer.astro
│   │   │   ├── Section.astro
│   │   │   └── Card.astro
│   │   │
│   │   └── islands/           # Interactive Solid.js islands
│   │       ├── ParticleFlow.tsx       # 36K particles Canvas
│   │       ├── KazakhstanMap.tsx      # SVG choropleth
│   │       ├── ScoringTable.tsx       # Virtualized table
│   │       ├── BudgetSimulator.tsx    # What-If sliders
│   │       ├── ShapWaterfall.tsx      # SHAP visualization
│   │       ├── MetricsPanel.tsx       # KPI cards
│   │       ├── FilterPanel.tsx        # Filters UI
│   │       ├── ApplicationCard.tsx    # Single app detail
│   │       ├── ComparisonChart.tsx    # FIFO vs Merit
│   │       └── ChatAssistant.tsx      # LLM chat
│   │
│   ├── lib/
│   │   ├── data/              # Pre-computed JSON (gitignored, built)
│   │   │   ├── applications.json
│   │   │   ├── aggregates.json
│   │   │   ├── simulations.json
│   │   │   ├── shap_values.json
│   │   │   └── map_data.json
│   │   │
│   │   ├── scoring/           # Scoring logic (shared with Worker)
│   │   │   ├── impact-score.ts
│   │   │   ├── eligibility.ts
│   │   │   ├── constraints.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── utils/
│   │   │   ├── format.ts      # Number/date formatting
│   │   │   ├── colors.ts      # Color scales
│   │   │   └── geo.ts         # GeoJSON helpers
│   │   │
│   │   └── stores/            # Solid.js stores
│   │       ├── filters.ts
│   │       ├── simulation.ts
│   │       └── chat.ts
│   │
│   ├── styles/
│   │   ├── global.css         # Tailwind imports
│   │   └── animations.css     # GSAP custom styles
│   │
│   └── assets/
│       ├── fonts/
│       ├── icons/
│       └── kz-map.svg         # Kazakhstan map SVG
│
├── ml/                        # Python ML pipeline
│   ├── requirements.txt
│   ├── pipeline.py            # Main orchestrator
│   ├── extract.py             # Excel → DataFrame
│   ├── transform.py           # Feature engineering
│   ├── train.py               # XGBoost training
│   ├── score.py               # Impact Score calculation
│   ├── simulate.py            # What-If scenarios
│   ├── explain.py             # SHAP values
│   ├── export.py              # DataFrame → JSON
│   └── tests/
│       ├── test_transform.py
│       ├── test_score.py
│       └── test_simulate.py
│
├── data/
│   ├── raw/                   # Original Excel (gitignored)
│   │   └── subsidies_2025.xlsx
│   └── processed/             # Intermediate files (gitignored)
│
├── docs/                      # Documentation
│   ├── PATTERNS.md
│   ├── DATASET.md
│   ├── SCORING.md
│   ├── ARCHITECTURE.md
│   ├── RESEARCH.md
│   └── WOW-STRATEGY.md
│
├── scripts/
│   ├── build-data.sh          # Run ML pipeline
│   └── deploy.sh              # Deploy to Cloudflare
│
└── README.md
```

---

## Компоненты (детально)

### ParticleFlow.tsx

36,000 частиц, представляющих заявки. Scroll-triggered перегруппировка.

```typescript
interface ParticleFlowProps {
  data: Application[];
  groupBy: "status" | "oblast" | "subsidy_type" | "score_bucket";
  colorBy: "status" | "score" | "amount";
  onParticleClick?: (app: Application) => void;
}

// Технические детали:
// - Canvas 2D (не WebGL) для совместимости
// - requestAnimationFrame loop
// - Spatial hashing для hover detection
// - GSAP для smooth transitions между группировками
// - Target: 60fps на MacBook Air M1
```

### KazakhstanMap.tsx

SVG карта с choropleth слоями.

```typescript
interface KazakhstanMapProps {
  layer: "reject_rate" | "budget" | "monopoly" | "specialization";
  level: "oblast" | "district";
  data: AggregateData;
  selectedRegion?: string;
  onRegionClick?: (region: string) => void;
  onRegionHover?: (region: string | null) => void;
}

// Технические детали:
// - Custom SVG с 192 районами (не GeoJSON — точнее границы)
// - D3 color scales (sequential, diverging)
// - Tooltip с mini-chart
// - Zoom/pan для районов
```

### ScoringTable.tsx

Виртуализированная таблица 36K строк.

```typescript
interface ScoringTableProps {
  data: Application[];
  columns: ColumnDef[];
  filters: Filters;
  sorting: SortingState;
  onRowClick?: (app: Application) => void;
  onFilterChange?: (filters: Filters) => void;
}

// Технические детали:
// - TanStack Table + TanStack Virtual
// - Row height: 48px, viewport: ~20 rows
// - Column resizing, sorting, filtering
// - Sticky header
// - Export to CSV
```

### BudgetSimulator.tsx

What-If симулятор с real-time обновлением.

```typescript
interface BudgetSimulatorProps {
  initialBudget: number;
  strategies: Strategy[];
  onSimulate: (params: SimulateRequest) => Promise<SimulateResponse>;
}

// UI:
// - Budget slider (10-100 млрд)
// - Strategy toggle (FIFO / Merit / Uplift)
// - Weight sliders (4 компонента)
// - Constraint inputs
// - Split-screen comparison
// - Animated metrics transition
```

---

## Deployment Pipeline

```yaml
# .github/workflows/deploy.yml

name: Deploy to Cloudflare

on:
  push:
    branches: [main]

jobs:
  build-ml:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install -r ml/requirements.txt
      - run: python ml/pipeline.py
      - uses: actions/upload-artifact@v4
        with:
          name: data
          path: src/lib/data/

  build-frontend:
    needs: build-ml
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: data
          path: src/lib/data/
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CF_API_TOKEN }}
          accountId: ${{ secrets.CF_ACCOUNT_ID }}
          projectName: agroscore
          directory: dist
```

---

## Performance Targets

| Метрика | Target | Как достигаем |
|---|---|---|
| **LCP** | <1.5s | SSG, CDN edge, critical CSS inline |
| **FID** | <100ms | Islands hydration, no blocking JS |
| **CLS** | <0.1 | Reserved space for charts |
| **TTI** | <3s | Lazy load islands, code splitting |
| **Bundle size** | <200KB gzipped | Tree-shaking, Solid.js (7KB) |
| **Data size** | <5MB gzipped | Pre-aggregation, pagination |
| **API latency** | <100ms | Cloudflare Workers edge |
| **Particle FPS** | 60fps | Canvas 2D, spatial hashing |

---

## Security

| Аспект | Решение |
|---|---|
| **API Keys** | Cloudflare Workers secrets (не в коде) |
| **Rate Limiting** | Cloudflare WAF rules |
| **Input Validation** | Zod schemas на Worker |
| **CORS** | Strict origin policy |
| **Data Privacy** | Нет PII в датасете (обезличен) |

---

## Anti-Fraud Layer (новое в v2)

### Архитектура Fraud Detection

```
┌─────────────────────────────────────────────────────────────────┐
│                      ANTI-FRAUD LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   INPUT: Application                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              FRAUD DETECTION FEATURES                    │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │ Volume   │ │ Multi-   │ │ Retry    │ │ Round    │    │    │
│  │  │ Outlier  │ │ District │ │ Velocity │ │ Number   │    │    │
│  │  │  (20%)   │ │  (25%)   │ │  (15%)   │ │  (10%)   │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │    │
│  │  │ Monopoly │ │ Weekend  │ │ Seasonal │                 │    │
│  │  │ District │ │ Submit   │ │ Anomaly  │                 │    │
│  │  │  (15%)   │ │  (5%)    │ │  (10%)   │                 │    │
│  │  └──────────┘ └──────────┘ └──────────┘                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   FRAUD RISK SCORE                       │    │
│  │                      [0 - 100]                           │    │
│  │                                                          │    │
│  │  < 30: Low Risk    → Normal processing                   │    │
│  │  30-50: Medium     → Flag for review                     │    │
│  │  50-70: High       → Requires audit                      │    │
│  │  > 70: Critical    → Auto-flag + manual review           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      OUTPUT                              │    │
│  │  • fraud_risk_score: number                              │    │
│  │  • flags: { high_fraud_risk, requires_audit }            │    │
│  │  • red_flags: string[]                                   │    │
│  │  • recommendation: 'proceed' | 'review' | 'audit'        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Fraud Detection в Scoring Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    IMPACT SCORE v2 PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Application                                                     │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. ELIGIBILITY PRE-CHECK (Rule-based)                   │    │
│  │    → Pass/Fail + Issues                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 2. BASE SCORE CALCULATION                               │    │
│  │    Strategic (20%) + Fairness (20%) + Need (15%)        │    │
│  │    + Efficiency (15%) + Mission (20%)                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 3. FRAUD RISK ASSESSMENT ← NEW                          │    │
│  │    7 red flags → Fraud Risk Score                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 4. FINAL SCORE                                          │    │
│  │    final = base_score - (fraud_penalty × fraud_risk)     │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 5. FAIRNESS CONSTRAINTS                                 │    │
│  │    MAX_SINGLE_RECIPIENT, MAX_DISTRICT, MIN_SMALL_FARMER  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### API Contract: Fraud Risk

```typescript
// POST /api/fraud-check
interface FraudCheckRequest {
  application_id?: string;
  bin_iin: string;
  district: string;
  subsidy_code: string;
  volume: number;
  sum: number;
  date: string;
}

interface FraudCheckResponse {
  fraud_risk_score: number;  // 0-100
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  flags: {
    high_fraud_risk: boolean;
    requires_audit: boolean;
  };
  red_flags: RedFlag[];
  recommendation: 'proceed' | 'review' | 'audit';
}

interface RedFlag {
  code: string;           // 'VOLUME_OUTLIER'
  severity: number;       // 0-1
  description: string;    // 'Объём в 3.2 раза выше медианы района'
  contribution: number;   // +15 points к fraud score
}
```

### Mission Alignment в Scoring

```typescript
// Добавлено в /api/score response
interface ScoreResponseV2 extends ScoreResponse {
  mission_alignment: {
    score: number;  // 0-100
    factors: {
      food_security_priority: number;
      small_farmer_bonus: number;
      underserved_region: number;
      productivity_potential: number;
      modernization_element: number;
    };
    alignment_level: 'low' | 'medium' | 'high';
  };
  fraud_risk: {
    score: number;
    flags: string[];
    requires_audit: boolean;
  };
}
```

### Scoring Logic (обновлённая структура)

```
src/lib/scoring/
├── impact-score.ts        # Основная формула v2
├── eligibility.ts         # Pre-Check правила
├── constraints.ts         # Fairness constraints
├── mission-alignment.ts   # Mission Alignment Score ← NEW
├── fraud-risk.ts          # Fraud Risk Score ← NEW
├── features/
│   ├── strategic.ts
│   ├── fairness.ts
│   ├── need.ts
│   ├── efficiency.ts
│   ├── mission.ts         # ← NEW
│   └── fraud.ts           # ← NEW
└── types.ts
```

### Fraud Detection Features (детально)

```typescript
// src/lib/scoring/fraud-risk.ts

interface FraudFeatures {
  // Аномалии в заявке
  volume_zscore: number;        // Z-score объёма vs район+тип
  price_zscore: number;         // Z-score цены за единицу
  round_number_flag: boolean;   // Круглое число (100, 500, 1000)
  weekend_submission: boolean;  // Подача в выходной
  
  // Паттерны поведения
  retry_velocity: number;       // Заявок за последние 30 дней
  multi_district_count: number; // Сколько районов у этого БИН
  seasonal_anomaly: boolean;    // Подача в нетипичный сезон
  
  // Контекст
  district_monopoly_idx: number; // Monopoly index района
  shared_bin_count: number;     // Сколько заявок с тем же БИН
}

const FRAUD_WEIGHTS = {
  volume_outlier: 0.20,
  multi_district: 0.25,
  retry_velocity: 0.15,
  monopoly_district: 0.15,
  round_number: 0.10,
  weekend_submission: 0.05,
  seasonal_anomaly: 0.10,
};
```

---

## Обновлённая структура проекта

```
src/lib/
├── data/                     # Pre-computed JSON
│   ├── applications.json
│   ├── aggregates.json
│   ├── simulations.json
│   ├── shap_values.json
│   ├── fraud_features.json   # ← NEW: pre-computed fraud features
│   └── map_data.json
│
├── scoring/                  # Scoring logic
│   ├── impact-score.ts       # v2 with 6 components
│   ├── eligibility.ts
│   ├── constraints.ts
│   ├── mission-alignment.ts  # ← NEW
│   ├── fraud-risk.ts         # ← NEW
│   └── types.ts
│
└── utils/
    ├── format.ts
    ├── colors.ts
    ├── geo.ts
    └── fraud-detection.ts    # ← NEW: fraud detection helpers
```
