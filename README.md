# AgroScore — AI-скоринг сельхозсубсидий

**Decentrathon 5.0 | Трек: AI inDrive Gov | Кейс 2: Скоринг при подаче на субсидии**

> **Live Demo:** [agroscore.pages.dev](https://agroscore.pages.dev)

---

## Что это

Merit-based система ранжирования заявок на субсидии в животноводстве Казахстана. Заменяет принцип FIFO («кто первый подал») на data-driven оценку потенциального эффекта субсидии.

Три режима работы:
1. **Scoring Engine** — ранжирование 36,651 реальных заявок по Impact Score (формульный, не black-box)
2. **Anomaly Detection** — Isolation Forest для выявления аномальных заявок (unsupervised ML)
3. **Proactive Finder** — рекомендация субсидий фермерам до подачи заявки (на синтетических профилях)

---

## ⚠️ Что реальное, что синтетическое

Это критически важно для оценки проекта. Мы явно маркируем происхождение каждого компонента.

### Реальные данные

| Источник | Что | Объём | Как получили |
|----------|-----|-------|-------------|
| **Хакатон dataset** | Заявки на субсидии 2025 | 36,651 записей, 11 колонок | Предоставлен организаторами (xlsx) |
| **stat.gov.kz** | Поголовье скота, производство, размер ферм по регионам | 70 xlsx файлов, 20 регионов × 34 признака | Скачаны вручную, распарсены `analyze_stat_gov.py` |
| **subsidy.plem.kz API** | Бюджет по областям, воронки одобрения, реестры 2019-2024 | 429K записей, 18 областей | Открытый API без авторизации, скрипт `download_plem.py` |
| **Правила субсидирования** | Нормативы, критерии, процесс | 116 стр. PDF | Анализ ТЗ |

### Производные данные (вычислены из реальных)

| Что | Как | Файл |
|-----|-----|------|
| 67 признаков на заявку | Feature engineering из основного датасета + stat.gov.kz + plem.kz | `data/processed/enriched_applications.csv` |
| Impact Score для 36,651 заявок | Формульный скоринг (5 компонентов) | `data/processed/scored_applications.json` |
| Anomaly Score для 36,651 заявок | Isolation Forest (unsupervised) на 8 поведенческих признаках | `data/ml_outputs/anomaly_scores.csv` |
| SHAP-анализ bias | XGBoost + SHAP на исторических отказах (доказывает bias, не используется для скоринга) | `data/processed/shap_importance.json` |
| Причины отказов | NLP-кластеризация поля `Solution` из plem.kz 2021/2024 (5,748 причин) | `data/processed/rejection_reasons.json` |
| FIFO vs Merit симуляция | Сравнение порядка финансирования на 2,854 заявках в очереди | В `scoring_summary.json` |

### Синтетические данные (сгенерированы нами)

| Что | Зачем | Файл |
|-----|-------|------|
| **200 профилей фермеров** | Демонстрация проактивного модуля. Распределения (поголовье, земля, области) взяты из реальной статистики stat.gov.kz, но сами профили — синтетические | `agroscore/public/data/farmer_profiles.json` |
| **Агронормы КЗ** | Нормативы пастбищной нагрузки, падёжа, инфраструктуры. Значения из реальных нормативных документов, структура файла — наша | `agroscore/public/data/agro_norms.json` |

**В production** синтетические профили заменяются на API реальных систем (ИСЖ, ЕГКН, ПКБ). Логика движка идентична.

---

## Запуск

### 1. ML Pipeline (Python)

```bash
# Установка зависимостей
pip install -r ml/requirements.txt   # pandas, sklearn, xgboost, shap, openpyxl

# Шаг 1: Feature engineering (основной датасет + внешние данные)
python pipeline/build_features.py
# → data/processed/enriched_applications.csv (36,651 × 67 столбцов)

# Шаг 2: ML модели (Isolation Forest + XGBoost bias discovery)
python ml/train.py
# → data/ml_outputs/anomaly_scores.csv
# → pipeline/models/iso_forest_pipeline.pkl
# → pipeline/models/xgb_bias_discovery.json
# → data/processed/shap_importance.json

# Шаг 3: Scoring + агрегаты для фронтенда
python pipeline/score.py
# → data/processed/scored_applications.json (36,651 заявок с баллами)
# → data/processed/scoring_summary.json (агрегаты для дашборда)
# → agroscore/public/data/*.json (данные для UI)
```

### 2. Frontend (Astro + React + Tailwind)

```bash
cd agroscore
npm install
npm run dev
# → http://localhost:4321
```

---

## Проблема

Субсидии на племенное животноводство (**139.3 млрд ₸/год**, 36,651 заявок) распределяются по FIFO — Пункт 21 Правил субсидирования.

| Проблема | Данные |
|----------|--------|
| Региональная лотерея | 0% отказов в Павлодаре vs 56% в Алматинской обл. |
| Retry-отказы | 30% заявок — повторные подачи одного фермера |
| Монополизация | Тюлькубасский район: 86% бюджета одному получателю |
| Бюджетный дефицит | Акмолинская обл.: 50.7% одобренных заявок ждут бюджет |
| Ceiling effect | Все видимые признаки объясняют лишь 31% причин отказа |

---

## Решение: Три модуля

### Модуль 1: Impact Score (Rules Engine)

Формульный (не black-box) скоринг из 5 компонентов. **Данные: реальные.**

| Компонент | Вес | Что измеряет | Источник данных |
|-----------|-----|-------------|-----------------|
| **Strategic Alignment** | 20% | Приоритеты АПК 2021-2030 | stat.gov.kz (34 признака) |
| **Fairness Factor** | 20% | Антимонополия, размер фермера | Основной датасет (агрегаты) |
| **Regional Need** | 20% | Бюджетный дефицит региона | plem.kz API + основной датасет |
| **Efficiency Potential** | 20% | История заявок, репутация района | Основной датасет (retry, reject rate) |
| **Fraud Risk** | −10% | Аномалии (outliers, круглые суммы) | Основной датасет + ML anomaly |

```
Score = 0.20×S + 0.20×F + 0.20×N + 0.20×E + 0.10×Base − 0.10×Fraud + Exception(0-15)
```

**Реализация:** `pipeline/score.py` (Python) + `agroscore/src/lib/scoringEngine.ts` (frontend PreCheck)

### Модуль 2: Anomaly Detection (ML)

Unsupervised ML для выявления аномальных заявок. **Данные: реальные.**

| Модель | Задача | Данные |
|--------|--------|--------|
| **Isolation Forest** | Anomaly scoring (0-100) для каждой из 36,651 заявок | 8 поведенческих признаков из enriched dataset |
| **XGBoost + SHAP** | Bias discovery — доказательство того, что geography/budget доминируют в отказах | Только для визуализации, **не используется в скоринге** |

**Реализация:** `ml/train.py` → `pipeline/models/`

### Модуль 3: Proactive Finder

Рекомендация субсидий фермерам до подачи заявки. **Данные: частично синтетические.**

| Компонент | Данные | Тип |
|-----------|--------|-----|
| Профили фермеров (200 шт.) | Сгенерированы по распределениям stat.gov.kz | **Синтетические** |
| Агронормы (пастбища, падёж, корма) | Из нормативных документов КЗ | **Реальные значения, наша структура** |
| Eligibility Engine (22 кластера) | Правила из Приложения 2 Правил субсидирования | **Реальные правила** |
| Impact Score | Та же формула, что и в Модуле 1 | **Реальная формула** |
| Действия специалиста (пригласить/отклонить) | Интерфейс для demo | **Prototype UI (без бэкенда)** |

**Реализация:** `agroscore/src/components/ProactiveFinder.tsx`

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────────────┐
│  ДАННЫЕ                                                             │
│  Выгрузка.xlsx (36,651 заявок) ← предоставлен                     │
│  stat.gov.kz (70 xlsx) ← скачаны                                   │
│  plem.kz API (429K записей + бюджет + воронки) ← скачаны           │
├─────────────────────────────────────────────────────────────────────┤
│  ML PIPELINE (Python, offline)                                      │
│                                                                     │
│  build_features.py                                                  │
│    Выгрузка + stat.gov + plem.kz → enriched_applications.csv (67 col)│
│                                                                     │
│  ml/train.py                                                        │
│    Isolation Forest → anomaly_scores.csv                            │
│    XGBoost + SHAP → shap_importance.json (bias proof)               │
│                                                                     │
│  score.py                                                           │
│    enriched + anomaly → scored_applications.json                    │
│    + scoring_summary.json + simulator.json + top/bottom500.json     │
├─────────────────────────────────────────────────────────────────────┤
│  FRONTEND (Astro 6 + React 19 + Tailwind 4)                        │
│                                                                     │
│  Страницы:                                                          │
│    / (index) — Dashboard с аналитикой и визуализациями              │
│    /workspace — B2G терминал с 6 вкладками                          │
│                                                                     │
│  Данные: читает JSON из /data/ (статика, без backend API)           │
└─────────────────────────────────────────────────────────────────────┘
```

### Технологический стек

| Слой | Технология |
|------|------------|
| **Feature Engineering** | Python 3.10, openpyxl, csv, json, math |
| **ML** | scikit-learn (Isolation Forest), XGBoost, SHAP |
| **Scoring** | Python (pipeline) + TypeScript (frontend PreCheck) |
| **Frontend** | Astro 6, React 19, Tailwind CSS 4 |
| **AI Assistant** | Google Gemini API (генеративный AI для помощи комиссии) |
| **Deploy** | Cloudflare Pages |

---

## Структура проекта

```
├── agroscore/                    # Frontend (Astro + React)
│   ├── public/data/              # 14 JSON файлов для UI (см. ниже)
│   ├── src/components/           # 14 React-компонентов
│   │   ├── Dashboard.tsx         # Landing page (аналитика, визуализации)
│   │   ├── Workspace.tsx         # B2G терминал (6 вкладок)
│   │   ├── AppTable.tsx          # Реестр 36K заявок с инспектором
│   │   ├── PreCheck.tsx          # Симулятор Pre-Check (та же формула)
│   │   ├── ProactiveFinder.tsx   # Проактивный модуль (синтетические профили)
│   │   ├── AnomalyRadar.tsx      # Radar аномалий (Isolation Forest)
│   │   ├── Simulator.tsx         # FIFO vs Merit симулятор
│   │   ├── PolicyConfigurator.tsx# Конфигуратор весов
│   │   ├── AiAssistant.tsx       # Gemini AI ассистент
│   │   └── ...                   # MacroRoi, OblastDecentralization, etc.
│   └── src/lib/
│       └── scoringEngine.ts      # Impact Score (frontend, идентичен pipeline)
│
├── pipeline/                     # Python scoring pipeline
│   ├── build_features.py         # Feature engineering (11 → 67 колонок)
│   ├── score.py                  # Impact Score + агрегаты + симуляции
│   └── models/                   # Сериализованные ML модели
│       ├── iso_forest_pipeline.pkl
│       └── xgb_bias_discovery.json
│
├── ml/                           # ML модели
│   ├── train.py                  # Isolation Forest + XGBoost + SHAP
│   └── requirements.txt
│
├── data/
│   ├── external/                 # Скачанные внешние данные
│   │   ├── stat_gov_kz/          # 70 xlsx файлов
│   │   ├── subsidy_plem_kz/      # API данные (budget, registry, stats)
│   │   ├── analyze_stat_gov.py   # Парсер → regional_features.csv
│   │   ├── download_plem.py      # Скрипт скачивания plem.kz API
│   │   └── analyze_rejections.py # NLP-кластеризация причин отказов
│   ├── processed/                # Результаты pipeline
│   │   ├── enriched_applications.csv  # 36,651 × 67
│   │   ├── scored_applications.json   # 36,651 с баллами
│   │   ├── scoring_summary.json       # Агрегаты для dashboard
│   │   └── rejection_reasons.json     # Причины отказов (5,748)
│   └── ml_outputs/
│       └── anomaly_scores.csv    # Isolation Forest → 36,651 anomaly scores
│
├── docs/
│   ├── SCORING.md                # Формулы, валидация, sensitivity analysis
│   ├── RESEARCH.md               # Нормативная база, USDA EQIP, EU CAP, OECD
│   └── DATASET.md                # Описание всех данных
│
└── Выгрузка...xlsx               # Исходный датасет хакатона
```

### Данные фронтенда (`agroscore/public/data/`)

| Файл | Происхождение | Что содержит |
|------|--------------|-------------|
| `scoring_summary.json` | **Вычислен** из реальных данных | Агрегаты: средние, распределения, Gini, triage |
| `all_apps.json` | **Вычислен** из реальных данных | 36,651 заявок (код, район, сумма, балл, anomaly) |
| `top500.json` / `bottom500.json` | **Вычислен** из реальных данных | Топ/низ заявки по Impact Score |
| `districts.json` | **Вычислен** из реальных данных | Агрегаты по 192 районам |
| `subsidy_codes.json` | **Вычислен** из реальных данных | Статистика по 46 типам субсидий |
| `simulator.json` | **Вычислен** из реальных данных | FIFO vs Merit на 2,854 заявках |
| `shap_importance.json` | **ML** (XGBoost + SHAP) | Bias discovery — какие признаки решают отказ |
| `rejection_reasons.json` | **Вычислен** из plem.kz 2021/2024 | 9 категорий причин отказов |
| `oblast_districts.json` | **Вычислен** из реальных данных | Иерархия область → район |
| `farmer_profiles.json` | **Синтетический** | 200 фермерских профилей для Proactive модуля |
| `agro_norms.json` | **Реальные нормативы, наша структура** | Пастбищная нагрузка, падёж, инфраструктура |

---

## Ключевые результаты

| Метрика | Значение | Источник |
|---------|----------|---------|
| Диапазон баллов | 35.9 — 84.0 | `score.py` на 36,651 реальных заявках |
| Средний балл | 61.8 | `score.py` |
| Gini по районам | 0.648 | Вычислено из распределения бюджета |
| Заявок с аномалией >70 | 302 (0.8%) | Isolation Forest |
| FIFO → Merit: прирост балла | +4.4 | Симуляция на 2,854 заявках в очереди |
| FIFO → Merit: мелких фермеров | +108 | Симуляция на 2,854 заявках |
| Категорий причин отказов | 9 | NLP-кластеризация 5,748 записей plem.kz |
| Чувствительность к весам | ±4.25 max | Sensitivity analysis (±25% на каждый вес) |

---

## Ограничения (честно)

1. **69% причин отказа невидимы** — качество документов, решения инспектора, автоматические проверки ГИСС. Поэтому мы делаем impact scoring, а не prediction.
2. **Веса не калиброваны эмпирически** — текущие веса = экспертная оценка. Sensitivity analysis проведён (±25%), но A/B тест не проводился.
3. **Нет farmer ID** — используем прокси (район + тип + сумма) для retry-detection. Точность не измерена.
4. **Проактивный модуль на синтетических данных** — 200 профилей сгенерированы по реальным распределениям, но не являются реальными фермерами. В production нужны API ИСЖ/ЕГКН/ПКБ.
5. **Действия специалиста (пригласить/отклонить) — только в UI** — нет бэкенда, состояние хранится в памяти браузера. Это prototype для демонстрации workflow.
6. **AI Assistant (Gemini)** — требует API-ключ Google. Без ключа ассистент не работает, остальная система — работает.
7. **Нет данных о результатах** — не знаем, кто эффективно использовал субсидию. Нет uplift modeling.
8. **Инструмент для комиссии, не замена** — ТЗ требует «помощь эксперту», не автономное решение.

---

## Что НЕ является simulation

Часто на хакатонах подменяют реальные данные симуляцией. Мы этого не делаем:

- **Impact Score** — формула применяется к **реальным** 36,651 заявкам с **реальными** признаками
- **Isolation Forest** — обучен на **реальных** поведенческих признаках из датасета
- **XGBoost bias** — обучен на **реальных** статусах (Отклонена/Исполнена)
- **FIFO vs Merit** — симуляция порядка на **реальных** 2,854 заявках в очереди (данные реальные, порядок — моделируемый)
- **Pre-Check** — та же формула Impact Score, пользователь вводит параметры

**Единственная симуляция:** Проактивный модуль (farmer_profiles.json — 200 синтетических профилей).

---

## Документация

| Документ | Содержание |
|----------|-----------|
| [SCORING.md](docs/SCORING.md) | Формулы, компоненты, sensitivity analysis, backtesting, проактивный модуль |
| [RESEARCH.md](docs/RESEARCH.md) | Нормативная база, USDA EQIP, EU CAP, OECD, fairness, антикоррупция |
| [DATASET.md](docs/DATASET.md) | Описание всех данных: основной, внешние, производные, синтетические |

---

## Команда

**Decentrathon 5.0 — AI inDrive Gov Track**
