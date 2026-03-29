# AI Integration: Варианты внедрения ИИ в AgroScore

Исследование вариантов интеграции AI в проект AgroScore: от API до MCP серверов, локальных моделей и edge inference.

---

## Три слоя ИИ в AgroScore

Проблема хакатонов: AI ради AI (предсказание на синтетических данных без ground truth). 
Наше решение: применять AI только там, где он даёт реальную, доказуемую ценность.

| Слой | Назначение | Технология | Зачем для проекта |
|---|---|---|---|
| **1. Вычислительный (ML)** | Выявление скрытых паттернов и аномалий | Isolation Forest, HDBSCAN, K-Means | Поиск фродовых колец, кластеризация фермеров |
| **2. Интеллектуальный (NL)** | Интерпретация метрик в текст | LLM (GPT-4o-mini / Cloudflare AI) | Объяснение отказов на человеческом языке |
| **3. Интеграционный (API)** | Стандартный интерфейс для AI-агентов | Model Context Protocol | Готовность к работе с Claude, GPT и будущими LLM |

---

## Сравнительный анализ ML для Fraud Detection

### Задача

Найти "фродовые кольца" — группы связанных заявок с аномальными паттернами:
- Один БИН/ИИН в разных районах
- Аномально большие объёмы
- Круглые суммы
- Подозрительная скорость retry

### Сравнение алгоритмов

| Алгоритм | Тип | Сильные стороны | Слабые стороны | Для AgroScore |
|---|---|---|---|---|
| **Isolation Forest** | Anomaly | Быстрый, хорош для point anomalies | Не видит кластеры, нет интерпретации | ✅ Baseline |
| **DBSCAN** | Clustering | Находит кластеры произвольной формы | Чувствителен к eps, не масштабируется | ⚠️ С осторожностью |
| **HDBSCAN** | Clustering | Автоматический eps, иерархия | Медленнее, требует tuning | ✅ Для кластеров |
| **LOF** | Anomaly | Локальная плотность | Медленный на больших данных | ❌ Не нужен |
| **Graph-based** | Network | Находит связи между заявками | Сложная реализация | 🎯 Future work |

### Рекомендация для AgroScore

```
┌─────────────────────────────────────────────────────────────────┐
│              FRAUD DETECTION PIPELINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  36,651 заявок                                                   │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. ISOLATION FOREST (Point Anomalies)                   │    │
│  │    • Volume outliers (>3σ от медианы района)            │    │
│  │    • Amount outliers                                     │    │
│  │    • Seasonal anomalies                                  │    │
│  │    Output: anomaly_score ∈ [-1, 1]                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 2. HDBSCAN (Fraud Rings)                                │    │
│  │    Features: [БИН, район, тип, объём, дата]             │    │
│  │    • min_cluster_size=5                                  │    │
│  │    • min_samples=3                                       │    │
│  │    Output: cluster_id, cluster_persistence              │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 3. RULE-BASED FLAGS                                      │    │
│  │    • multi_district: один БИН в 3+ районах              │    │
│  │    • round_numbers: сумма кратна 1М                     │    │
│  │    • retry_velocity: 3+ заявки за 7 дней                │    │
│  │    • monopoly_district: 50%+ бюджета района             │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  Fraud Risk Score = w1×IF + w2×HDBSCAN + w3×Rules              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Код реализации

```python
# ml/fraud_detection.py
from sklearn.ensemble import IsolationForest
import hdbscan
import numpy as np

def detect_fraud(applications_df):
    """
    Двухэтапный fraud detection:
    1. Isolation Forest для point anomalies
    2. HDBSCAN для fraud rings
    """
    
    # Этап 1: Isolation Forest
    features_if = ['volume_normalized', 'amount_normalized', 'retry_count']
    iso_forest = IsolationForest(
        contamination=0.05,  # Ожидаем ~5% аномалий
        random_state=42,
        n_jobs=-1
    )
    applications_df['anomaly_score'] = iso_forest.fit_predict(
        applications_df[features_if]
    )
    
    # Этап 2: HDBSCAN для кластеров
    features_hdb = ['bin_encoded', 'district_encoded', 'subsidy_type_encoded', 
                    'volume_normalized', 'submission_day']
    
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=5,
        min_samples=3,
        metric='euclidean',
        cluster_selection_epsilon=0.5
    )
    applications_df['cluster_id'] = clusterer.fit_predict(
        applications_df[features_hdb]
    )
    applications_df['cluster_persistence'] = clusterer.probabilities_
    
    # Этап 3: Rule-based flags
    applications_df['flag_multi_district'] = (
        applications_df.groupby('bin_iin')['district'].transform('nunique') >= 3
    ).astype(int)
    
    applications_df['flag_round_number'] = (
        applications_df['amount'] % 1_000_000 == 0
    ).astype(int)
    
    # Финальный Fraud Risk Score
    applications_df['fraud_risk_score'] = (
        0.4 * (applications_df['anomaly_score'] == -1).astype(int) +
        0.3 * (applications_df['cluster_id'] >= 0).astype(int) +
        0.2 * applications_df['flag_multi_district'] +
        0.1 * applications_df['flag_round_number']
    ) * 100
    
    return applications_df
```

### Честные ограничения ML

```
⚠️ DISCLAIMER для Fraud Detection:

1. Нет ground truth — мы НЕ знаем, какие заявки реально фродовые
2. Кластер ≠ fraud ring — это только гипотеза для аудита
3. False positives возможны — честные крупные фермеры могут попасть
4. Интерпретация субъективна — веса выбраны экспертно, не обучены

Мы называем это "Fraud Risk Score", а не "Fraud Detection" — 
это сигнал для ручной проверки, не автоматическое решение.
```

---

## Сравнительный анализ LLM провайдеров

### Задача

Генерировать человекопонятные объяснения:
- Почему заявка получила такой Impact Score
- Какие факторы повлияли больше всего (на основе SHAP)
- Что можно улучшить

### Сравнение провайдеров

| Провайдер | Модель | Input $/1M | Output $/1M | Latency | Русский | Рекомендация |
|---|---|---|---|---|---|---|
| **OpenAI** | GPT-4o | $2.50 | $10.00 | ~800ms | ⭐⭐⭐⭐ | Для сложных задач |
| **OpenAI** | GPT-4o-mini | $0.15 | $0.60 | ~400ms | ⭐⭐⭐⭐ | **✅ Лучший баланс** |
| **Anthropic** | Claude Sonnet | $3.00 | $15.00 | ~900ms | ⭐⭐⭐⭐⭐ | Высокое качество |
| **Anthropic** | Claude Haiku | $0.25 | $1.25 | ~300ms | ⭐⭐⭐⭐ | Быстрый |
| **Google** | Gemini 2.0 Flash | $0.10 | $0.40 | ~350ms | ⭐⭐⭐ | Дешёвый |
| **Cloudflare** | Llama 3.1 8B | ~$0.01* | ~$0.01* | ~50ms | ⭐⭐⭐ | **✅ Edge/Free** |
| **Ollama** | Llama 3.1 8B | Free | Free | ~200ms | ⭐⭐⭐ | Offline/Dev |

*Cloudflare: $0.011 per 1,000 Neurons (~10K tokens free/day)

### Калькуляция для AgroScore

```
Сценарий: Объяснение для 36,651 заявок

Средний запрос:
- Input: ~500 tokens (контекст + SHAP values)
- Output: ~200 tokens (объяснение)

Общий объём:
- Input: 36,651 × 500 = 18.3M tokens
- Output: 36,651 × 200 = 7.3M tokens

┌─────────────────────────────────────────────────────────────────┐
│                    COST COMPARISON                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GPT-4o:          $45.75 + $73.00 = $118.75                     │
│  GPT-4o-mini:     $2.75 + $4.38 = $7.13 ✅                       │
│  Claude Sonnet:   $54.90 + $109.50 = $164.40                    │
│  Claude Haiku:    $4.58 + $9.13 = $13.71                        │
│  Gemini Flash:    $1.83 + $2.92 = $4.75                         │
│  Cloudflare AI:   ~$0.25 (почти бесплатно) ✅                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Качество vs Стоимость

```
                    Качество
                       ▲
                       │
        Claude Sonnet ●│
                       │  ● GPT-4o
                       │
         Claude Haiku ●│  ● GPT-4o-mini  ← Оптимум
                       │
          Gemini Flash●│
                       │
       Cloudflare/Llama●│
                       │
                       └──────────────────────▶ Стоимость
                      $0                    $150
```

### Рекомендация для AgroScore

| Сценарий | Провайдер | Почему |
|---|---|---|
| **Хакатон (демо)** | Cloudflare AI | Бесплатно, быстро, достаточно |
| **Pre-compute batch** | GPT-4o-mini | Качество по цене, один раз |
| **Real-time chat** | Cloudflare AI | 50ms latency, edge |
| **Production** | Hybrid | GPT-4o-mini (batch) + Cloudflare (real-time) |

---

## Cost/Latency матрица

### Полная картина затрат

| Компонент | Технология | Стоимость | Latency | Примечания |
|---|---|---|---|---|
| **ML Pipeline** | Python + scikit-learn | $0 | 1-time | Pre-compute |
| **Scoring API** | Cloudflare Workers | $5/mo | 10ms | Бесплатный tier |
| **LLM Explanations** | GPT-4o-mini | ~$7 | 400ms | Batch pre-compute |
| **Real-time Chat** | Cloudflare AI | ~$0.25 | 50ms | 10K free/day |
| **Vector DB (RAG)** | Cloudflare Vectorize | $0.05/mo | 5ms | 5M vectors free |
| **MCP Server** | Node.js | $0 | 100ms | Self-hosted |

### Итого для 36K заявок

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOTAL COST ESTIMATE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  One-time (pre-compute):                                         │
│    • ML fraud detection: $0 (local Python)                       │
│    • LLM explanations: ~$7 (GPT-4o-mini)                         │
│    • SHAP values: $0 (local Python)                              │
│    ────────────────────────────────                              │
│    Subtotal: ~$7                                                 │
│                                                                  │
│  Monthly (production):                                           │
│    • Cloudflare Workers: $5                                      │
│    • Cloudflare AI (10K/day free): $0-5                         │
│    • Vectorize: $0.05                                            │
│    ────────────────────────────────                              │
│    Subtotal: ~$10/month                                          │
│                                                                  │
│  TOTAL YEAR 1: $7 + $120 = ~$127 ✅                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Финальные рекомендации для AgroScore

### Для хакатона (MVP)

| Слой | Решение | Статус |
|---|---|---|
| **ML (Fraud)** | Isolation Forest + rules | Pre-compute → JSON |
| **LLM (Explain)** | GPT-4o-mini batch | Pre-compute → JSON |
| **Chat** | Cloudflare AI + hardcoded context | Real-time |
| **MCP** | Не нужен | Показать как roadmap |

```typescript
// Простое решение для хакатона
const explanation = precomputedExplanations[applicationId];
// ИЛИ
const explanation = await cloudflareAI.run('@cf/meta/llama-3.1-8b-instruct', {
  messages: [
    { role: 'system', content: AGROSCORE_CONTEXT },
    { role: 'user', content: `Объясни score ${score}` }
  ]
});
```

### Для production

| Слой | Решение | Почему |
|---|---|---|
| **ML (Fraud)** | Isolation Forest + HDBSCAN + Graph | Комплексный анализ |
| **LLM (Explain)** | GPT-4o-mini (batch) + cache | Качество + экономия |
| **Chat** | Cloudflare AI (edge) | Latency |
| **RAG** | Vectorize + rules knowledge base | Точность |
| **MCP** | Full implementation | Интеграция с Claude |

### Decision Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    DECISION MATRIX                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Если нужно...          → Используй...                          │
│  ─────────────────────────────────────                          │
│  Качество объяснений    → GPT-4o-mini (batch)                   │
│  Минимальная latency    → Cloudflare AI (edge)                  │
│  Минимальная стоимость  → Cloudflare AI (free tier)             │
│  Offline работа         → Ollama (local)                        │
│  Интеграция с Claude    → MCP Server                            │
│  Fraud detection        → Isolation Forest + HDBSCAN            │
│  Интерпретация ML       → SHAP values                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Что НЕ делать

```
❌ НЕ ДЕЛАТЬ:

1. Fine-tuning на хакатоне — нет времени и данных
2. Full RAG pipeline — overkill для 36K статичных заявок
3. AI Agents — слишком сложно, непредсказуемо
4. Real-time ML inference — pre-compute достаточно
5. Voice AI — nice-to-have, но не core
6. Document Vision — нет документов в датасете
```

---

## Варианты интеграции LLM и MCP


## 1. MCP (Model Context Protocol)

### Что это

MCP — открытый протокол от Anthropic для подключения AI к внешним данным и инструментам. Позволяет Claude (и другим LLM) напрямую работать с вашими системами.

**Ключевые концепции:**
- **Tools** — функции, которые AI может вызывать (model-controlled)
- **Resources** — данные, которые AI может читать (app-controlled)
- **Prompts** — шаблоны запросов (user-controlled)

### AgroScore как MCP Server

```typescript
// src/mcp/agroscore-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "agroscore",
  version: "1.0.0",
});

// Tool: Рассчитать Impact Score
server.tool(
  "calculate_impact_score",
  "Рассчитывает Impact Score v2 для заявки на субсидию",
  {
    oblast: { type: "string", description: "Область" },
    district: { type: "string", description: "Район" },
    subsidy_type: { type: "string", description: "Тип субсидии" },
    volume: { type: "number", description: "Объём (голов/га)" },
    amount: { type: "number", description: "Сумма в тенге" },
  },
  async (params) => {
    const score = await calculateImpactScoreV2(params);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(score, null, 2),
        },
      ],
    };
  }
);

// Tool: Проверить Fraud Risk
server.tool(
  "check_fraud_risk",
  "Проверяет заявку на признаки мошенничества",
  {
    bin_iin: { type: "string", description: "БИН/ИИН заявителя" },
    district: { type: "string", description: "Район" },
    volume: { type: "number", description: "Объём" },
    amount: { type: "number", description: "Сумма" },
  },
  async (params) => {
    const fraudRisk = await calculateFraudRisk(params);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(fraudRisk, null, 2),
        },
      ],
    };
  }
);

// Tool: Симуляция бюджета
server.tool(
  "simulate_budget",
  "Симулирует распределение бюджета по разным стратегиям",
  {
    budget: { type: "number", description: "Бюджет в тенге" },
    strategy: { 
      type: "string", 
      enum: ["fifo", "merit", "uplift"],
      description: "Стратегия распределения" 
    },
  },
  async (params) => {
    const simulation = await runBudgetSimulation(params);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(simulation, null, 2),
        },
      ],
    };
  }
);

// Resource: Статистика по регионам
server.resource(
  "regions_stats",
  "agroscore://regions/stats",
  "Статистика субсидий по регионам Казахстана",
  "application/json",
  async () => {
    const stats = await getRegionsStats();
    return JSON.stringify(stats);
  }
);

// Resource: Топ заявок
server.resource(
  "top_applications",
  "agroscore://applications/top",
  "Топ-100 заявок по Impact Score",
  "application/json",
  async () => {
    const top = await getTopApplications(100);
    return JSON.stringify(top);
  }
);

// Запуск сервера
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Конфигурация для Claude Desktop

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "agroscore": {
      "command": "node",
      "args": ["/path/to/agroscore/dist/mcp/server.js"],
      "env": {
        "DATA_PATH": "/path/to/agroscore/data"
      }
    }
  }
}
```

### Преимущества MCP

| Преимущество | Описание |
|---|---|
| **Нативная интеграция** | Claude напрямую работает с AgroScore |
| **Контекст** | AI видит реальные данные, не галлюцинирует |
| **Безопасность** | Данные остаются локально |
| **Расширяемость** | Легко добавлять новые tools |

### Применение в AgroScore

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP INTEGRATION                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Claude Desktop                                                  │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  MCP Client                              │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       │ stdio / SSE                                              │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               AgroScore MCP Server                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │calculate │ │ check    │ │ simulate │ │ explain  │    │    │
│  │  │_score    │ │ _fraud   │ │ _budget  │ │ _decision│    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  AgroScore Data                          │    │
│  │  • 36,651 applications                                   │    │
│  │  • Pre-computed scores                                   │    │
│  │  • SHAP values                                           │    │
│  │  • Simulations                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Cloudflare Workers AI (Edge Inference)

### Что это

Cloudflare Workers AI позволяет запускать LLM inference на edge — ближе к пользователю, с низкой latency.

**Доступные модели:**
- Llama 3.1 (8B, 70B)
- Mistral 7B
- Gemma 2
- Phi-3
- Whisper (speech-to-text)
- Stable Diffusion (image generation)

### Интеграция с AgroScore

```typescript
// src/workers/ai-assistant.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { question, context } = await request.json();
    
    // Получаем контекст из AgroScore данных
    const relevantData = await getRelevantContext(question, env);
    
    // Запускаем inference на edge
    const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: `Ты — эксперт по субсидиям сельского хозяйства Казахстана. 
                    Используй следующие данные для ответа:
                    ${JSON.stringify(relevantData)}`
        },
        {
          role: "user",
          content: question
        }
      ],
      max_tokens: 1024,
      temperature: 0.7,
    });
    
    return Response.json(response);
  }
};
```

### Преимущества Edge AI

| Преимущество | Описание |
|---|---|
| **Низкая latency** | ~50ms vs ~500ms для cloud API |
| **Глобальная доступность** | 300+ edge locations |
| **Pay-per-use** | Нет фиксированных затрат |
| **Приватность** | Данные не покидают edge |

### Ограничения

| Ограничение | Влияние |
|---|---|
| **Размер модели** | Max 70B параметров |
| **Контекст** | Max 8K-32K токенов |
| **Качество** | Хуже чем GPT-4/Claude |

---

## 3. Ollama (Локальные модели)

### Что это

Ollama — платформа для запуска LLM локально. Поддерживает Llama, Mistral, Phi, Gemma и другие модели.

### Интеграция с AgroScore

```typescript
// src/lib/ollama-client.ts
import { Ollama } from 'ollama';

const ollama = new Ollama({ host: 'http://localhost:11434' });

export async function explainScore(application: Application): Promise<string> {
  const context = {
    score: application.impact_score,
    components: application.score_components,
    shap_values: application.shap_values,
  };
  
  const response = await ollama.chat({
    model: 'llama3.1:8b',
    messages: [
      {
        role: 'system',
        content: `Ты — эксперт по субсидиям. Объясни, почему заявка получила такой Impact Score.
                  Используй SHAP values для объяснения влияния каждого фактора.
                  Отвечай на русском языке, кратко и понятно.`
      },
      {
        role: 'user',
        content: `Объясни этот результат: ${JSON.stringify(context)}`
      }
    ],
    options: {
      temperature: 0.3,
      num_predict: 500,
    }
  });
  
  return response.message.content;
}
```

### Рекомендуемые модели для AgroScore

| Модель | Размер | Задача | Качество |
|---|---|---|---|
| **Llama 3.1 8B** | 4.7GB | Общие объяснения | ⭐⭐⭐⭐ |
| **Mistral 7B** | 4.1GB | Быстрые ответы | ⭐⭐⭐ |
| **Phi-3 Mini** | 2.3GB | Легковесный | ⭐⭐⭐ |
| **Qwen2 7B** | 4.4GB | Мультиязычный | ⭐⭐⭐⭐ |

### Преимущества локальных моделей

| Преимущество | Описание |
|---|---|
| **Бесплатно** | Нет API costs |
| **Приватность** | Данные не покидают машину |
| **Offline** | Работает без интернета |
| **Кастомизация** | Можно fine-tune |

---

## 4. RAG (Retrieval-Augmented Generation)

### Что это

RAG — подход, где LLM дополняется релевантным контекстом из базы знаний перед генерацией ответа.

### RAG Pipeline для AgroScore

```
┌─────────────────────────────────────────────────────────────────┐
│                      RAG PIPELINE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Query: "Почему отклонили заявку из Алматинской области?"  │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. EMBEDDING                                             │    │
│  │    Query → Vector [0.12, -0.34, 0.56, ...]              │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 2. RETRIEVAL                                             │    │
│  │    Vector DB → Top-K relevant chunks                     │    │
│  │    • Правила субсидирования (Приказ №264)               │    │
│  │    • Статистика Алматинской области                      │    │
│  │    • Типичные причины отказов                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 3. AUGMENTATION                                          │    │
│  │    Prompt = System + Context + Query                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 4. GENERATION                                            │    │
│  │    LLM → Ответ с цитатами из источников                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Knowledge Base для AgroScore

| Источник | Тип | Chunks |
|---|---|---|
| Приказ МСХ №264 | Правила | ~50 |
| Концепция АПК 2021-2030 | Стратегия | ~30 |
| RESEARCH.md | Исследование | ~100 |
| SCORING.md | Методология | ~80 |
| FAQ субсидий | Вопросы | ~200 |
| **ИТОГО** | | **~460** |

### Реализация с Cloudflare Vectorize

```typescript
// src/lib/rag.ts
import { Ai } from '@cloudflare/ai';

export async function ragQuery(
  question: string,
  env: Env
): Promise<string> {
  // 1. Embed query
  const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: question
  });
  
  // 2. Search vector DB
  const results = await env.VECTORIZE.query(embedding.data[0], {
    topK: 5,
    returnMetadata: true,
  });
  
  // 3. Build context
  const context = results.matches
    .map(m => m.metadata.text)
    .join('\n\n');
  
  // 4. Generate response
  const response = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content: `Отвечай на вопросы о субсидиях, используя только этот контекст:
                  ${context}
                  Если информации нет в контексте, скажи "Не знаю".`
      },
      { role: 'user', content: question }
    ]
  });
  
  return response.response;
}
```

---

## 5. AI Agents

### Что это

AI Agents — автономные системы, которые могут планировать и выполнять сложные задачи, используя tools.

### Agent для AgroScore

```typescript
// src/agents/subsidy-advisor.ts
import { Agent, Tool } from './agent-framework';

const subsidyAdvisor = new Agent({
  name: 'SubsidyAdvisor',
  description: 'Помогает фермерам с заявками на субсидии',
  
  tools: [
    new Tool({
      name: 'check_eligibility',
      description: 'Проверяет соответствие критериям',
      execute: async (params) => checkEligibility(params),
    }),
    new Tool({
      name: 'calculate_score',
      description: 'Рассчитывает Impact Score',
      execute: async (params) => calculateImpactScoreV2(params),
    }),
    new Tool({
      name: 'find_similar',
      description: 'Находит похожие одобренные заявки',
      execute: async (params) => findSimilarApplications(params),
    }),
    new Tool({
      name: 'suggest_improvements',
      description: 'Предлагает улучшения для заявки',
      execute: async (params) => suggestImprovements(params),
    }),
  ],
  
  systemPrompt: `Ты — консультант по субсидиям. Твоя задача:
    1. Понять ситуацию фермера
    2. Проверить соответствие критериям
    3. Рассчитать потенциальный score
    4. Предложить улучшения
    5. Найти похожие успешные кейсы`
});

// Использование
const result = await subsidyAdvisor.run(
  "У меня 50 голов КРС в Алматинской области. Могу ли я получить субсидию?"
);
```

### Сценарии использования агентов

| Сценарий | Описание | Tools |
|---|---|---|
| **Pre-Check Advisor** | Проверка перед подачей | eligibility, score, improvements |
| **Application Optimizer** | Оптимизация заявки | score, similar, counterfactual |
| **Fraud Investigator** | Расследование аномалий | fraud_check, network_analysis |
| **Budget Planner** | Планирование бюджета | simulate, forecast, optimize |

---

## 6. Hybrid Architecture

### Рекомендуемая архитектура для AgroScore

```
┌─────────────────────────────────────────────────────────────────┐
│                    HYBRID AI ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                      FRONTEND                            │    │
│  │  Astro + Solid.js Islands                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   AI ROUTER                              │    │
│  │  Выбирает оптимальный backend для задачи                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ├──────────────┬──────────────┬──────────────┐            │
│       ▼              ▼              ▼              ▼            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Edge AI  │  │ OpenAI   │  │ MCP      │  │ Local    │        │
│  │ (fast)   │  │ (smart)  │  │ (tools)  │  │ (free)   │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│       │              │              │              │            │
│       │              │              │              │            │
│       └──────────────┴──────────────┴──────────────┘            │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    AGROSCORE DATA                        │    │
│  │  • Applications JSON                                     │    │
│  │  • Vector DB (RAG)                                       │    │
│  │  • Pre-computed scores                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Routing Logic

```typescript
// src/lib/ai-router.ts
type AIBackend = 'edge' | 'openai' | 'mcp' | 'local';

interface RouterConfig {
  task: string;
  complexity: 'low' | 'medium' | 'high';
  latencyRequired: number; // ms
  costSensitive: boolean;
}

function selectBackend(config: RouterConfig): AIBackend {
  // Простые задачи → Edge AI (быстро, дёшево)
  if (config.complexity === 'low' && config.latencyRequired < 100) {
    return 'edge';
  }
  
  // Сложные задачи → OpenAI (качество)
  if (config.complexity === 'high' && !config.costSensitive) {
    return 'openai';
  }
  
  // Tool-based задачи → MCP
  if (config.task.includes('calculate') || config.task.includes('simulate')) {
    return 'mcp';
  }
  
  // Экономия → Local
  if (config.costSensitive) {
    return 'local';
  }
  
  return 'edge'; // default
}
```

### Распределение задач

| Задача | Backend | Причина |
|---|---|---|
| Quick FAQ | Edge AI | Низкая latency |
| Score explanation | Edge AI | Простой контекст |
| Complex analysis | OpenAI | Качество рассуждений |
| Tool execution | MCP | Прямой доступ к данным |
| Batch processing | Local | Бесплатно |
| Development/Testing | Local | Offline |

---

## 7. Roadmap внедрения

### Phase 1: MVP (Хакатон)

| Задача | Приоритет | Время |
|---|---|---|
| OpenAI API chat assistant | ✅ Есть | — |
| Pre-computed explanations | MUST | 2h |
| Basic RAG (hardcoded context) | SHOULD | 3h |

### Phase 2: Post-Hackathon

| Задача | Приоритет | Время |
|---|---|---|
| MCP Server implementation | HIGH | 1 day |
| Cloudflare Workers AI | HIGH | 1 day |
| Vector DB for RAG | MEDIUM | 2 days |
| AI Router | MEDIUM | 1 day |

### Phase 3: Production

| Задача | Приоритет | Время |
|---|---|---|
| Full RAG pipeline | HIGH | 1 week |
| AI Agents | MEDIUM | 2 weeks |
| Fine-tuning on domain data | LOW | 1 month |
| Hybrid architecture | LOW | 2 weeks |

---

## 8. Рекомендации для хакатона

### Что реализовать сейчас

1. **Pre-computed explanations** — генерируем объяснения заранее через OpenAI, сохраняем в JSON
2. **Simple RAG** — hardcoded контекст из RESEARCH.md и SCORING.md в system prompt
3. **Streaming responses** — используем Vercel AI SDK для streaming

### Что показать как roadmap

1. **MCP Server** — "В будущем Claude сможет напрямую работать с AgroScore"
2. **Edge AI** — "Снизим latency до 50ms с Cloudflare Workers AI"
3. **AI Agents** — "Автономный консультант для фермеров"

### Код для демо

```typescript
// Простой RAG с hardcoded контекстом
const AGROSCORE_CONTEXT = `
AgroScore — система merit-based скоринга субсидий.
Impact Score v2 состоит из 6 компонентов:
- Strategic Alignment (20%)
- Fairness Factor (20%)
- Regional Need (15%)
- Efficiency Potential (15%)
- Mission Alignment (20%)
- Fraud Risk (-10%)

Ключевые инсайты:
- 69% причин отказов невидимы в данных
- 65% отказов — это retry одного фермера
- Тюлькубас: 86% бюджета одному получателю
`;

export async function chatWithAgroScore(
  question: string,
  openai: OpenAI
): Promise<ReadableStream> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    stream: true,
    messages: [
      {
        role: 'system',
        content: `Ты — эксперт по AgroScore. Используй этот контекст:
                  ${AGROSCORE_CONTEXT}
                  Отвечай кратко, на русском языке.`
      },
      { role: 'user', content: question }
    ],
  });
  
  return response.toReadableStream();
}
```

---

## 9. Сравнение подходов

| Критерий | OpenAI API | MCP | Edge AI | Local | RAG |
|---|---|---|---|---|---|
| **Качество** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Latency** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Cost** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Privacy** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Complexity** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Offline** | ❌ | ✅ | ❌ | ✅ | ❌ |

---

## 10. Честные ограничения

```
⚠️ DISCLAIMER:

1. MCP пока работает только с Claude Desktop
2. Edge AI модели слабее GPT-4/Claude
3. RAG требует качественной knowledge base
4. Fine-tuning требует много данных
5. Agents могут быть непредсказуемы
6. Hybrid архитектура сложна в поддержке
```

---

---

## 11. MCP: Расширенная спецификация

### Три примитива MCP

| Примитив | Контроль | Описание | Пример |
|---|---|---|---|
| **Tools** | Model | Функции, которые LLM может вызывать | `calculate_score`, `simulate_budget` |
| **Resources** | Application | Пассивные данные для контекста | `agroscore://regions/stats` |
| **Prompts** | User | Шаблоны инструкций | "Проанализируй заявку" |

### Полная спецификация AgroScore MCP Server

```typescript
// src/mcp/agroscore-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "agroscore",
  version: "2.0.0",
  description: "Merit-based subsidy scoring system for Kazakhstan agriculture"
});

// ═══════════════════════════════════════════════════════════════
// TOOLS (Model-controlled)
// ═══════════════════════════════════════════════════════════════

// Tool 1: Calculate Impact Score v2
server.tool(
  "calculate_impact_score",
  "Рассчитывает Impact Score v2 для заявки на субсидию (6 компонентов)",
  {
    oblast: { type: "string", description: "Область (например, 'Алматинская')" },
    district: { type: "string", description: "Район хозяйства" },
    subsidy_type: { type: "string", description: "Тип субсидии (код или название)" },
    volume: { type: "number", description: "Объём (голов скота или га)" },
    amount: { type: "number", description: "Запрашиваемая сумма в тенге" },
    is_retry: { type: "boolean", description: "Повторная подача?", default: false },
  },
  async (params) => {
    const score = await calculateImpactScoreV2(params);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          final_score: score.final_score,
          percentile: score.percentile,
          components: score.components,
          flags: score.flags,
          recommendation: score.recommendation,
        }, null, 2)
      }]
    };
  }
);

// Tool 2: Check Fraud Risk
server.tool(
  "check_fraud_risk",
  "Проверяет заявку на признаки мошенничества (7 red flags)",
  {
    bin_iin: { type: "string", description: "БИН/ИИН заявителя" },
    district: { type: "string", description: "Район" },
    volume: { type: "number", description: "Объём" },
    amount: { type: "number", description: "Сумма" },
    submission_date: { type: "string", description: "Дата подачи (ISO)" },
  },
  async (params) => {
    const fraud = await calculateFraudRisk(params);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          fraud_risk_score: fraud.score,
          risk_level: fraud.level,
          red_flags: fraud.flags,
          requires_audit: fraud.requires_audit,
          recommendation: fraud.recommendation,
        }, null, 2)
      }]
    };
  }
);

// Tool 3: Simulate Budget Allocation
server.tool(
  "simulate_budget",
  "Симулирует распределение бюджета по разным стратегиям",
  {
    budget: { type: "number", description: "Бюджет в тенге" },
    strategy: { 
      type: "string", 
      enum: ["fifo", "merit", "uplift"],
      description: "Стратегия: FIFO (текущая), Merit (по score), Uplift (по additionality)" 
    },
    oblast_filter: { type: "string", description: "Фильтр по области (опционально)" },
  },
  async (params) => {
    const simulation = await runBudgetSimulation(params);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          strategy: params.strategy,
          budget_allocated: simulation.allocated,
          farmers_funded: simulation.farmers_count,
          average_score: simulation.avg_score,
          gini_coefficient: simulation.gini,
          small_farmer_share: simulation.small_farmer_pct,
        }, null, 2)
      }]
    };
  }
);

// Tool 4: Explain Decision
server.tool(
  "explain_decision",
  "Объясняет, почему заявка получила такой score (SHAP + counterfactual)",
  {
    application_id: { type: "string", description: "ID заявки" },
    explanation_type: { 
      type: "string", 
      enum: ["shap", "counterfactual", "both"],
      default: "both"
    },
  },
  async (params) => {
    const explanation = await explainDecision(params);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(explanation, null, 2)
      }]
    };
  }
);

// Tool 5: Find Similar Applications
server.tool(
  "find_similar",
  "Находит похожие одобренные заявки для сравнения",
  {
    oblast: { type: "string" },
    subsidy_type: { type: "string" },
    volume_range: { type: "number", description: "±% от объёма", default: 20 },
    limit: { type: "number", default: 5 },
  },
  async (params) => {
    const similar = await findSimilarApplications(params);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(similar, null, 2)
      }]
    };
  }
);

// Tool 6: Pre-Check Eligibility
server.tool(
  "check_eligibility",
  "Проверяет соответствие критериям до подачи заявки",
  {
    subsidy_type: { type: "string" },
    volume: { type: "number" },
    oblast: { type: "string" },
    has_registration: { type: "boolean" },
    has_land_docs: { type: "boolean" },
  },
  async (params) => {
    const eligibility = await checkEligibility(params);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          eligible: eligibility.passed,
          issues: eligibility.issues,
          suggestions: eligibility.suggestions,
        }, null, 2)
      }]
    };
  }
);

// ═══════════════════════════════════════════════════════════════
// RESOURCES (Application-controlled)
// ═══════════════════════════════════════════════════════════════

// Resource 1: Regional Statistics
server.resource(
  "regions_stats",
  "agroscore://regions/stats",
  "Статистика субсидий по всем регионам Казахстана",
  "application/json",
  async () => {
    const stats = await getRegionsStats();
    return JSON.stringify(stats);
  }
);

// Resource 2: Top Applications
server.resource(
  "top_applications",
  "agroscore://applications/top",
  "Топ-100 заявок по Impact Score",
  "application/json",
  async () => {
    const top = await getTopApplications(100);
    return JSON.stringify(top);
  }
);

// Resource 3: Subsidy Rules
server.resource(
  "subsidy_rules",
  "agroscore://rules/current",
  "Текущие правила субсидирования (Приказ МСХ №264)",
  "text/markdown",
  async () => {
    return await loadSubsidyRules();
  }
);

// Resource 4: Fraud Patterns
server.resource(
  "fraud_patterns",
  "agroscore://fraud/patterns",
  "Известные паттерны мошенничества",
  "application/json",
  async () => {
    return JSON.stringify(FRAUD_PATTERNS);
  }
);

// Resource Template: District Details
server.resourceTemplate(
  "district_details",
  "agroscore://district/{oblast}/{district}",
  "Детальная статистика по району",
  "application/json"
);

// Resource Template: Application Details
server.resourceTemplate(
  "application_details",
  "agroscore://application/{id}",
  "Детали конкретной заявки",
  "application/json"
);

// ═══════════════════════════════════════════════════════════════
// PROMPTS (User-controlled)
// ═══════════════════════════════════════════════════════════════

// Prompt 1: Analyze Application
server.prompt(
  "analyze_application",
  "Полный анализ заявки на субсидию",
  [
    { name: "application_id", description: "ID заявки", required: true }
  ],
  async (params) => {
    const app = await getApplication(params.application_id);
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Проанализируй эту заявку на субсидию:
            
${JSON.stringify(app, null, 2)}

Используй tools calculate_impact_score и check_fraud_risk для анализа.
Дай рекомендации по улучшению заявки.`
          }
        }
      ]
    };
  }
);

// Prompt 2: Compare Strategies
server.prompt(
  "compare_strategies",
  "Сравнение стратегий распределения бюджета",
  [
    { name: "budget", description: "Бюджет в млрд тенге", required: true }
  ],
  async (params) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Сравни три стратегии распределения бюджета ${params.budget} млрд тенге:
1. FIFO (текущая система)
2. Merit-based (по Impact Score)
3. Uplift (по additionality)

Используй tool simulate_budget для каждой стратегии.
Покажи разницу в количестве фермеров, Gini coefficient, доле мелких хозяйств.`
          }
        }
      ]
    };
  }
);

// Prompt 3: Fraud Investigation
server.prompt(
  "investigate_fraud",
  "Расследование подозрительных заявок",
  [
    { name: "district", description: "Район для проверки", required: true }
  ],
  async (params) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Проведи расследование подозрительных заявок в районе ${params.district}.

1. Найди заявки с высоким fraud risk score
2. Проверь паттерны: multi-district, volume outliers, round numbers
3. Выяви связанные заявки (один БИН)
4. Дай рекомендации для аудита`
          }
        }
      ]
    };
  }
);

// Запуск сервера
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("AgroScore MCP Server running on stdio");
```

### MCP Protocol Operations

| Метод | Назначение | Возвращает |
|---|---|---|
| `tools/list` | Список доступных tools | Array of tool definitions |
| `tools/call` | Вызов tool | Tool execution result |
| `resources/list` | Список resources | Array of resource descriptors |
| `resources/read` | Чтение resource | Resource data |
| `resources/templates/list` | Список шаблонов | Array of templates |
| `prompts/list` | Список prompts | Array of prompt definitions |
| `prompts/get` | Получить prompt | Prompt messages |

---

## 12. Fine-tuning на агро-данных

### Зачем fine-tuning?

| Проблема | Решение через fine-tuning |
|---|---|
| LLM не знает казахстанские термины | Дообучение на локальных документах |
| Неправильные рекомендации | Обучение на реальных кейсах |
| Медленные ответы (большая модель) | Fine-tune маленькой модели |
| Высокая стоимость API | Локальная fine-tuned модель |

### Методы fine-tuning

| Метод | Память | Качество | Скорость | Рекомендация |
|---|---|---|---|---|
| **Full Fine-tuning** | 100% | ⭐⭐⭐⭐⭐ | Медленно | Для production |
| **LoRA** | ~10% | ⭐⭐⭐⭐ | Быстро | **Рекомендуется** |
| **QLoRA** | ~5% | ⭐⭐⭐ | Очень быстро | Для экспериментов |
| **Prompt Tuning** | ~1% | ⭐⭐ | Мгновенно | Для простых задач |

### LoRA для AgroScore

```python
# fine_tuning/train_agroscore_lora.py
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model, TaskType
from datasets import load_dataset

# Базовая модель
model_name = "Qwen/Qwen2-7B-Instruct"  # Хорошо работает с русским
model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype="auto")
tokenizer = AutoTokenizer.from_pretrained(model_name)

# LoRA конфигурация
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,                    # Rank (8-64)
    lora_alpha=32,           # Scaling factor
    lora_dropout=0.1,
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
)

model = get_peft_model(model, lora_config)
print(f"Trainable params: {model.print_trainable_parameters()}")
# Output: trainable params: 4,194,304 || all params: 7,615,616,000 || trainable%: 0.055%

# Датасет для fine-tuning
TRAINING_DATA = [
    {
        "instruction": "Объясни, почему заявка получила низкий Impact Score",
        "input": "Заявка: КРС, Алматинская область, 500 голов, 50 млн тенге, Score: 42",
        "output": """Заявка получила низкий Impact Score (42) по следующим причинам:

1. **Fairness Factor (низкий)**: 500 голов — это крупное хозяйство. Система приоритизирует мелких фермеров (Rawlsian fairness).

2. **Regional Need (средний)**: Алматинская область имеет высокий reject rate (56%), но также высокую конкуренцию.

3. **Mission Alignment (средний)**: КРС — не приоритетное направление для продбезопасности (птица = 58% самообеспеченность, КРС = 82%).

**Рекомендации:**
- Разбить заявку на несколько меньших
- Добавить элементы модернизации
- Рассмотреть птицеводство как альтернативу"""
    },
    # ... ещё 1000+ примеров
]

# Обучение
from transformers import TrainingArguments, Trainer

training_args = TrainingArguments(
    output_dir="./agroscore-lora",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    warmup_steps=100,
    logging_steps=10,
    save_steps=500,
    fp16=True,
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
)

trainer.train()
model.save_pretrained("./agroscore-lora-final")
```

### Датасет для fine-tuning

| Категория | Примеры | Источник |
|---|---|---|
| **Score Explanations** | 500 | Сгенерированы из SHAP |
| **Fraud Analysis** | 200 | Реальные кейсы |
| **Eligibility Q&A** | 300 | Правила субсидирования |
| **Recommendations** | 400 | Экспертные советы |
| **Regional Context** | 200 | Статистика по областям |
| **ИТОГО** | **1,600** | |

### Рекомендуемые модели для fine-tuning

| Модель | Размер | Русский | Рекомендация |
|---|---|---|---|
| **Qwen2-7B** | 7B | ⭐⭐⭐⭐⭐ | **Лучший выбор** |
| **Mistral-7B** | 7B | ⭐⭐⭐ | Быстрый |
| **Llama-3.1-8B** | 8B | ⭐⭐⭐⭐ | Хороший баланс |
| **Phi-3-mini** | 3.8B | ⭐⭐ | Легковесный |

---

## 13. Voice AI для фермеров

### Почему голосовой интерфейс?

| Проблема | Решение |
|---|---|
| Фермеры в поле, руки заняты | Голосовое управление |
| Низкая цифровая грамотность | Естественный язык |
| Казахский/русский языки | Whisper поддерживает оба |
| Плохой интернет | Offline STT |

### Архитектура Voice AI

```
┌─────────────────────────────────────────────────────────────────┐
│                      VOICE AI PIPELINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Фермер говорит                                                  │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 1. SPEECH-TO-TEXT (Whisper)                             │    │
│  │    "Могу ли я получить субсидию на 50 коров?"           │    │
│  │    Языки: казахский, русский                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 2. INTENT RECOGNITION                                    │    │
│  │    Intent: check_eligibility                             │    │
│  │    Entities: { animal: "КРС", count: 50 }               │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 3. AGROSCORE PROCESSING                                  │    │
│  │    MCP tools: check_eligibility, calculate_score         │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 4. TEXT-TO-SPEECH                                        │    │
│  │    "Да, вы можете подать заявку. Ваш примерный score..." │    │
│  └─────────────────────────────────────────────────────────┘    │
│       │                                                          │
│       ▼                                                          │
│  Фермер слышит ответ                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Whisper для казахского и русского

```typescript
// src/voice/speech-to-text.ts
import { Ai } from '@cloudflare/ai';

export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  env: Env
): Promise<{ text: string; language: string }> {
  // Cloudflare Workers AI Whisper
  const result = await env.AI.run('@cf/openai/whisper', {
    audio: [...new Uint8Array(audioBuffer)],
  });
  
  return {
    text: result.text,
    language: result.language, // 'kk' или 'ru'
  };
}

// Альтернатива: Whisper через API
import OpenAI from 'openai';

export async function transcribeWithOpenAI(
  audioFile: File
): Promise<string> {
  const openai = new OpenAI();
  
  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-1',
    language: 'ru', // или 'kk' для казахского
    response_format: 'text',
  });
  
  return transcription;
}
```

### Поддержка казахского языка

| Сервис | Казахский | Русский | Качество |
|---|---|---|---|
| **OpenAI Whisper** | ✅ | ✅ | ⭐⭐⭐⭐ |
| **Cloudflare Whisper** | ✅ | ✅ | ⭐⭐⭐ |
| **ElevenLabs Scribe** | ✅ | ✅ | ⭐⭐⭐⭐⭐ |
| **Google Speech** | ✅ | ✅ | ⭐⭐⭐⭐ |
| **Yandex SpeechKit** | ❌ | ✅ | ⭐⭐⭐⭐ |

### Text-to-Speech

```typescript
// src/voice/text-to-speech.ts
export async function synthesizeSpeech(
  text: string,
  language: 'ru' | 'kk'
): Promise<ArrayBuffer> {
  // ElevenLabs для качественного TTS
  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/voice_id', {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      }
    }),
  });
  
  return response.arrayBuffer();
}
```

---

## 14. Мультимодальность: Анализ документов и фото

### Сценарии использования

| Сценарий | Вход | Выход |
|---|---|---|
| **OCR документов** | Фото справки | Извлечённые данные |
| **Верификация скота** | Фото стада | Подсчёт голов |
| **Анализ земли** | Спутниковый снимок | Площадь, тип культуры |
| **Проверка техники** | Фото трактора | Модель, состояние |

### Vision LLM для документов

```typescript
// src/multimodal/document-analysis.ts
import OpenAI from 'openai';

export async function analyzeDocument(
  imageBase64: string,
  documentType: 'certificate' | 'invoice' | 'land_doc'
): Promise<ExtractedData> {
  const openai = new OpenAI();
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Ты — эксперт по анализу сельскохозяйственных документов Казахстана.
                  Извлеки структурированные данные из документа.
                  Отвечай в JSON формате.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
          {
            type: 'text',
            text: `Проанализируй этот документ типа "${documentType}".
                   Извлеки: дату, номер, владельца, ключевые данные.`
          }
        ],
      }
    ],
    response_format: { type: 'json_object' },
  });
  
  return JSON.parse(response.choices[0].message.content);
}
```

### Подсчёт скота по фото

```typescript
// src/multimodal/livestock-counting.ts
export async function countLivestock(
  imageBase64: string,
  animalType: 'cattle' | 'sheep' | 'horses'
): Promise<{ count: number; confidence: number }> {
  const openai = new OpenAI();
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Ты — эксперт по подсчёту сельскохозяйственных животных.
                  Подсчитай количество ${animalType} на фото.
                  Учитывай частично видимых животных.
                  Верни JSON: { count: number, confidence: 0-1, notes: string }`
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
          },
          { type: 'text', text: 'Подсчитай животных на этом фото.' }
        ],
      }
    ],
    response_format: { type: 'json_object' },
  });
  
  return JSON.parse(response.choices[0].message.content);
}
```

### Анализ спутниковых снимков

```typescript
// src/multimodal/satellite-analysis.ts
export async function analyzeLandUse(
  satelliteImageBase64: string,
  coordinates: { lat: number; lon: number }
): Promise<LandAnalysis> {
  const openai = new OpenAI();
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Ты — эксперт по анализу спутниковых снимков сельхозугодий.
                  Определи:
                  1. Тип земли (пашня, пастбище, залежь)
                  2. Примерную площадь обрабатываемой земли
                  3. Состояние (обработана, заброшена)
                  4. Наличие построек
                  Верни JSON.`
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${satelliteImageBase64}` },
          },
          { 
            type: 'text', 
            text: `Координаты: ${coordinates.lat}, ${coordinates.lon}. Проанализируй этот участок.` 
          }
        ],
      }
    ],
    response_format: { type: 'json_object' },
  });
  
  return JSON.parse(response.choices[0].message.content);
}
```

### Сравнение Vision моделей

| Модель | OCR | Подсчёт | Спутник | Стоимость |
|---|---|---|---|---|
| **GPT-4o** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $$$ |
| **Claude 3.5 Sonnet** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $$ |
| **Gemini 2.0 Flash** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | $ |
| **Qwen-VL** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | Free |
| **LLaVA** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | Free |

---

## 15. Интегрированная архитектура

### Полная AI архитектура AgroScore

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGROSCORE AI PLATFORM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    INPUT LAYER                           │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │   Text   │ │  Voice   │ │  Image   │ │   API    │    │    │
│  │  │  (Chat)  │ │ (Whisper)│ │ (Vision) │ │  (MCP)   │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    AI ROUTER                             │    │
│  │  Выбирает оптимальный backend для задачи                 │    │
│  │  • Simple → Edge AI (fast, cheap)                        │    │
│  │  • Complex → Cloud API (smart)                           │    │
│  │  • Tools → MCP Server (direct)                           │    │
│  │  • Batch → Local (free)                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│       ┌──────────────────────┼──────────────────────┐           │
│       ▼                      ▼                      ▼           │
│  ┌──────────┐          ┌──────────┐          ┌──────────┐       │
│  │ Edge AI  │          │ Cloud AI │          │ Local AI │       │
│  │ Workers  │          │ OpenAI   │          │ Ollama   │       │
│  │ Llama 8B │          │ GPT-4o   │          │ Qwen 7B  │       │
│  └──────────┘          └──────────┘          └──────────┘       │
│       │                      │                      │           │
│       └──────────────────────┼──────────────────────┘           │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    MCP SERVER                            │    │
│  │  Tools: score, fraud, simulate, explain, similar         │    │
│  │  Resources: stats, rules, patterns                       │    │
│  │  Prompts: analyze, compare, investigate                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    DATA LAYER                            │    │
│  │  • 36,651 applications (JSON)                            │    │
│  │  • Pre-computed scores & SHAP                            │    │
│  │  • Vector DB for RAG                                     │    │
│  │  • Knowledge base (rules, FAQ)                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 16. Roadmap внедрения (обновлённый)

### Phase 1: Хакатон (сейчас)

| Задача | Статус | Время |
|---|---|---|
| OpenAI API chat | ✅ Есть | — |
| Pre-computed explanations | TODO | 2h |
| Simple RAG (hardcoded) | TODO | 3h |
| **ИТОГО Phase 1** | | **5h** |

### Phase 2: Post-Hackathon (1-2 недели)

| Задача | Приоритет | Время |
|---|---|---|
| MCP Server (6 tools, 4 resources) | HIGH | 2 days |
| Cloudflare Workers AI | HIGH | 1 day |
| Vector DB (Vectorize) | MEDIUM | 2 days |
| Voice AI (Whisper) | MEDIUM | 1 day |
| **ИТОГО Phase 2** | | **6 days** |

### Phase 3: Production (1-2 месяца)

| Задача | Приоритет | Время |
|---|---|---|
| Fine-tuning (LoRA) | HIGH | 2 weeks |
| Full RAG pipeline | HIGH | 1 week |
| Document Vision | MEDIUM | 1 week |
| AI Agents | LOW | 2 weeks |
| Hybrid architecture | LOW | 1 week |
| **ИТОГО Phase 3** | | **7 weeks** |

---

## Ссылки

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Ollama](https://ollama.com/)
- [Vercel AI SDK](https://ai-sdk.dev/)
- [LangChain](https://langchain.com/)
- [Whisper](https://openai.com/research/whisper)
- [LoRA Paper](https://arxiv.org/abs/2106.09685)
- [ElevenLabs](https://elevenlabs.io/)
