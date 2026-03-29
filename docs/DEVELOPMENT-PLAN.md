# План разработки AgroScore

Детальный план разработки, разбитый на 6 фаз с оценкой времени и зависимостями, оптимизированный для команды из 4+ человек.

---

## Обзор

| Фаза | Название | Время | Параллельность |
|---|---|---|---|
| 0 | Инфраструктура | 2-3 часа | Блокирующая |
| 1 | ML Pipeline | 4-6 часов | DEV-1 |
| 2 | Базовый Frontend | 3-4 часа | DEV-2 (параллельно с Фазой 1) |
| 3 | Interactive Islands | 6-8 часов | DEV-2, DEV-3 |
| 4 | API + AI | 4-5 часов | DEV-1 |
| 5 | Интеграция и тесты | 3-4 часа | Все |
| 6 | Полировка и демо | 2-3 часа | Все |

**Общее время:** ~24-33 часа (при параллельной работе: ~12-16 часов)

---

## Фаза 0: Инфраструктура (2-3 часа) 🔴 БЛОКИРУЮЩАЯ

**Ответственный:** Lead Dev

### Задачи

- [ ] **0.1** Инициализация Astro проекта
  ```bash
  npm create astro@latest agroscore -- --template minimal
  cd agroscore
  npx astro add cloudflare solid tailwind
  ```

- [ ] **0.2** Настройка структуры проекта
  ```
  src/
  ├── pages/
  ├── components/astro/
  ├── components/islands/
  ├── lib/data/
  ├── lib/scoring/
  ├── lib/utils/
  └── styles/
  ml/
  data/raw/
  docs/
  ```

- [ ] **0.3** Конфигурация TypeScript, ESLint, Prettier

- [ ] **0.4** Настройка Cloudflare Pages + Workers
  - Создать проект в CF dashboard
  - Настроить wrangler.toml
  - Настроить environment variables

- [ ] **0.5** CI/CD pipeline (GitHub Actions)
  - Build ML → Build Frontend → Deploy

- [ ] **0.6** Git hooks (husky + lint-staged)

### Deliverable
Рабочий проект с `npm run dev`, деплой на CF работает.

---

## Фаза 1: ML Pipeline (4-6 часов)

**Ответственный:** DEV-1 (Python/ML)

### Зависимости
- Фаза 0 завершена
- Excel датасет в `data/raw/`

### Задачи

- [ ] **1.1** Extract (extract.py) — 1 час
  - Чтение Excel (pandas)
  - Парсинг дат, кодов, сумм
  - Валидация схемы
  - Output: `raw_df.pkl`

- [ ] **1.2** Transform (transform.py) — 2 часа
  - Case-level дедупликация
  - Feature engineering (11 фич)
  - Агрегации (district, oblast, month)
  - Fraud features calculation
  - Output: `transformed_df.pkl`, `aggregates.pkl`

- [ ] **1.3** Score (score.py) — 1.5 часа
  - Impact Score v2 calculation (6 компонентов)
  - Mission Alignment Score
  - Fraud Risk Score
  - SHAP values (top-10 per app)
  - Output: `scored_df.pkl`, `shap_values.pkl`

- [ ] **1.4** Simulate (simulate.py) — 1 час
  - 3 стратегии: FIFO, Merit, Uplift
  - 5 budget levels: 20, 40, 60, 80, 100 млрд
  - Metrics: Gini, small farmer share, monopoly districts
  - Output: `simulations.pkl`

- [ ] **1.5** Export (export.py) — 0.5 часа
  - DataFrame → JSON (gzipped)
  - Output files:
    - `applications.json` (~5MB)
    - `aggregates.json` (~100KB)
    - `simulations.json` (~200KB)
    - `shap_values.json` (~2MB)
    - `fraud_features.json` (~500KB)
    - `map_data.json` (~50KB)

### Deliverable
JSON файлы в `src/lib/data/`, готовые для frontend.

---

## Фаза 2: Базовый Frontend (3-4 часа)

**Ответственный:** DEV-2 (Frontend)

### Зависимости
- Фаза 0 завершена
- Можно начинать параллельно с Фазой 1 (mock data)

### Задачи

- [ ] **2.1** Layout и навигация — 1 час
  - `Header.astro` — логотип, навигация
  - `Footer.astro` — credits, links
  - `Layout.astro` — общий layout
  - Tailwind config (colors, fonts)

- [ ] **2.2** Landing page (index.astro) — 1 час
  - Hero section с ключевыми цифрами
  - Problem statement
  - Solution overview
  - CTA buttons

- [ ] **2.3** Страницы (scaffold) — 1 час
  - `simulator.astro` — What-If
  - `dashboard.astro` — Scoring Dashboard
  - `precheck.astro` — Pre-Check для фермера
  - Placeholder для islands

- [ ] **2.4** Базовые компоненты — 1 час
  - `Card.astro`
  - `Section.astro`
  - `MetricCard.astro`
  - `Button.astro`

### Deliverable
4 страницы с layout, можно навигировать.

---

## Фаза 3: Interactive Islands (6-8 часов)

**Ответственные:** DEV-2 + DEV-3 (Frontend)

### Зависимости
- Фаза 2 завершена
- Фаза 1 завершена (JSON данные)

### Задачи (DEV-2)

- [ ] **3.1** KazakhstanMap.tsx — 2 часа
  - SVG карта с 18 областями
  - Choropleth слои (reject_rate, budget, monopoly)
  - Hover tooltips
  - Click to select region

- [ ] **3.2** ScoringTable.tsx — 2 часа
  - TanStack Table + Virtual
  - Виртуализация 36K строк
  - Sorting, filtering
  - Row click → detail

- [ ] **3.3** FilterPanel.tsx — 1 час
  - Oblast multi-select
  - Subsidy type multi-select
  - Amount range slider
  - Score range slider

### Задачи (DEV-3)

- [ ] **3.4** ParticleFlow.tsx — 3 часа
  - Canvas 2D, 36K частиц
  - Group by: status, oblast, score_bucket
  - Color by: status, score
  - Smooth transitions (GSAP)
  - Hover detection (spatial hashing)

- [ ] **3.5** BudgetSimulator.tsx — 2 часа
  - Budget slider
  - Strategy toggle
  - Weight sliders
  - Real-time metrics update
  - Comparison chart

- [ ] **3.6** ShapWaterfall.tsx — 1 час
  - SHAP waterfall chart (D3)
  - Top-10 features
  - Interactive tooltips

### Deliverable
Все интерактивные компоненты работают с real data.

---

## Фаза 4: API + AI (4-5 часов)

**Ответственный:** DEV-1 (Backend)

### Зависимости
- Фаза 1 завершена (данные)
- Фаза 0 завершена (CF Workers настроен)

### Задачи

- [ ] **4.1** Scoring API (score.ts) — 1 час
  - `/api/score` endpoint
  - Impact Score calculation
  - Eligibility check
  - Input validation (Zod)

- [ ] **4.2** Simulation API (simulate.ts) — 1.5 часа
  - `/api/simulate` endpoint
  - Budget allocation logic
  - Constraints enforcement
  - Metrics calculation

- [ ] **4.3** Explain API (explain.ts) — 1 час
  - `/api/explain` endpoint
  - SHAP values lookup
  - Counterfactual generation

- [ ] **4.4** Chat API (chat.ts) — 1.5 часа
  - `/api/chat` endpoint
  - OpenAI / Cloudflare AI integration
  - Context injection (aggregates)
  - Streaming response

### Deliverable
Все API endpoints работают, <100ms latency.

---

## Фаза 5: Интеграция и тесты (3-4 часа)

**Ответственные:** Все

### Зависимости
- Фазы 1-4 завершены

### Задачи

- [ ] **5.1** Интеграция islands ↔ API — 1 час
  - BudgetSimulator → /api/simulate
  - PreCheck form → /api/score
  - ChatAssistant → /api/chat

- [ ] **5.2** Scrollytelling (GSAP) — 1 час
  - ScrollTrigger setup
  - ParticleFlow transitions
  - Map layer switches
  - Metric animations

- [ ] **5.3** Тестирование — 1 час
  - ML pipeline tests
  - API endpoint tests
  - Component rendering tests
  - E2E smoke test

- [ ] **5.4** Performance optimization — 1 час
  - Bundle analysis
  - Lazy loading islands
  - Image optimization
  - Lighthouse audit

### Deliverable
Полностью работающий продукт, все тесты green.

---

## Фаза 6: Полировка и демо (2-3 часа)

**Ответственные:** Все

### Зависимости
- Фаза 5 завершена

### Задачи

- [ ] **6.1** UI полировка — 1 час
  - Responsive design check
  - Dark mode (если есть время)
  - Micro-animations
  - Loading states

- [ ] **6.2** Демо сценарий — 1 час
  - Подготовить 5-минутный flow
  - Pre-select интересные кейсы
  - Fraud detection demo
  - What-If comparison

- [ ] **6.3** Документация — 0.5 часа
  - README update
  - Screenshots/GIFs
  - Demo video (если есть время)

- [ ] **6.4** Deploy final version — 0.5 часа
  - Production build
  - Final deploy
  - Smoke test on prod

### Deliverable
Production-ready продукт для демо.

---

## Критический путь

```
Фаза 0 (3ч) ─┬─▶ Фаза 1 (6ч) ──▶ Фаза 4 (5ч) ─┬─▶ Фаза 5 (4ч) ──▶ Фаза 6 (3ч)
             │                                 │
             └─▶ Фаза 2 (4ч) ──▶ Фаза 3 (8ч) ─┘

Критический путь: 0 → 2 → 3 → 5 → 6 = 22 часа
С параллельной работой: ~12-14 часов
```

---

## Распределение по команде

| Роль | Фазы | Фокус |
|---|---|---|
| **Lead Dev (DEV-1)** | 0, 1, 4 | ML Pipeline, API, Архитектура |
| **Frontend (DEV-2)** | 2, 3 | Pages, Map, Table, Filters |
| **Frontend (DEV-3)** | 3, 5 | ParticleFlow, Simulator, Scrollytelling |
| **Domain Expert** | 1, 6 | Валидация логики, демо сценарий |

---

## Риски и митигации

| Риск | Вероятность | Митигация |
|---|---|---|
| ParticleFlow слишком медленный | Средняя | Fallback: группировка частиц, снижение до 10K |
| SVG карта не работает | Низкая | Fallback: использовать готовый GeoJSON |
| OpenAI rate limits | Низкая | Fallback: Cloudflare AI или pre-computed responses |
| Данные не сходятся | Средняя | Валидация на каждом этапе ML pipeline |
| Не хватает времени | Средняя | Приоритизация: MVP сначала, WOW потом |

---

## MVP vs Full

### MVP (минимум для демо)
- [ ] Landing page с ключевыми цифрами
- [ ] Карта с reject rate по областям
- [ ] Таблица топ-100 заявок
- [ ] What-If симулятор (3 стратегии)
- [ ] Pre-Check форма

### Full (если хватит времени)
- [ ] ParticleFlow 36K
- [ ] Scrollytelling narrative
- [ ] SHAP waterfall
- [ ] Chat assistant
- [ ] Fraud detection demo

---

## Чеклист перед стартом

- [ ] Excel датасет в `data/raw/`
- [ ] SVG карта Казахстана готова
- [ ] Cloudflare account настроен
- [ ] OpenAI API key получен
- [ ] Команда распределена по ролям
- [ ] Git repo создан, все имеют доступ

---

## Технологии (quick reference)

| Категория | Технология | Версия |
|---|---|---|
| Framework | Astro | 5.x |
| Islands | Solid.js | 1.8+ |
| Styling | Tailwind CSS | 4.x |
| Visualization | D3.js | 7.x |
| Animation | GSAP | 3.x |
| Tables | TanStack Table | 8.x |
| Hosting | Cloudflare Pages | — |
| API | Cloudflare Workers | — |
| ML | Python + Pandas + XGBoost | — |
| LLM | OpenAI / Cloudflare AI | — |
