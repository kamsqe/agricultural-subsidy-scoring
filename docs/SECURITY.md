# Безопасность и приватность данных

## 1. Контекст: как работает ГИСС сейчас

### Авторизация в ГИСС (subsidy.plem.kz)

Текущая система субсидирования использует **ЭЦП + NCALayer**:

1. Пользователь заходит на `subsidy.plem.kz`
2. Нажимает «Войти» → выбирает ЭЦП-ключ (`AUTH_RSA`)
3. NCALayer (десктопное приложение НУЦ РК) подписывает запрос
4. Система идентифицирует фермера по **ИИН/БИН** из сертификата

Никакой логин/пароль — только криптографическая подпись.

### Интеграции ГИСС

ГИСС интегрирован с 5+ государственными системами через защищённый шлюз:

| Система | Что проверяет | Протокол |
|---|---|---|
| **ИСЖ** (идентификация сельхозживотных) | Поголовье скота | SOAP / REST через eGov шлюз |
| **ИБСПР** (селекционная база) | Породный состав | SOAP |
| **КГД** (Комитет гос. доходов) | Электронные счета-фактуры, налоги | REST через eGov шлюз |
| **АИС ГЗК** (Земельный кадастр) | Земельные участки | REST |
| **Минюст** | Юридический статус | REST |

**Вывод:** прямого доступа к БД нет. Все данные передаются через **API-шлюз eGov** с аутентификацией через сертификаты.

---

## 2. Нормативная база (обязательно к упоминанию)

### Закон РК «О персональных данных и их защите»

| Требование | Влияние на нашу систему |
|---|---|
| Уведомление об утечках в течение 1 рабочего дня (с 01.07.2024) | Наш датасет обезличен → утечка не является инцидентом с ПДн |
| Разделение данных на общедоступные и ограниченного доступа | Скоринговые баллы — не ПДн. ИИН/БИН — ПДн (отсутствуют в текущем датасете) |
| Назначение ответственного за обработку ПДн | В production — обязательно. На хакатоне — вне scope |
| Обязательное использование сервисов контроля доступа при работе с ГИС | В production — через eGov шлюз |

### Единые требования ИБ (ПП РК №832, ред. 2026)

С 10 марта 2026 года распространяются на **все частные системы, интегрируемые с государственными**:

| Требование | Наш статус |
|---|---|
| Соответствие **СТ РК ISO/IEC 27002-2023** | Архитектурно готовы (serverless, encryption in transit) |
| Испытания ГТС для допуска к эксплуатации | Post-hackathon, при реальной интеграции |
| Исходные коды в репозиторий ГТС | Код будет open-source — требование покрыто |
| Национальные СКЗИ (криптозащита) | NCALayer для ЭЦП-авторизации в production |
| Логирование действий пользователей | Реализуемо через Cloudflare Analytics + Workers Logs |

### Требования по ИИ (ПП РК 2026)

Новые Единые требования (февраль 2026) впервые включают понятие **«системы ИИ»**:

- Обязательная документация алгоритмов принятия решений
- Объяснимость (explainability) результатов  
- Контроль предвзятости (bias detection)

**Мы покрываем все три:** Impact Score имеет документированную формулу, SHAP-объяснения для каждого балла, и модуль fairness с анализом региональной предвзятости.

---

## 3. Модель угроз

### Что мы защищаем

| Актив | Уровень критичности | Комментарий |
|---|---|---|
| **Скоринговые баллы** | Средний | Не ПДн, но могут влиять на распределение бюджета |
| **Агрегированные данные** | Низкий | Статистика по регионам — публичная информация |
| **Формула scoring** | Низкий | Должна быть прозрачной (explainability) |
| **Веса модели** | Средний | Манипуляция весами → перераспределение субсидий |
| **API endpoints** | Высокий | DoS или injection → нарушение работы |
| **ИИН/БИН** (в production) | **Критический** | ПДн. В текущем датасете отсутствуют |

### Матрица угроз

| Угроза | Вероятность | Последствия | Митигация |
|---|---|---|---|
| **Score manipulation** — подбор весов для продвижения конкретного фермера | Средняя | Нечестное распределение | Ограничение диапазона весов, audit log |
| **Data exfiltration** — утечка полного датасета | Низкая (данные обезличены) | Минимальные при обезличенных данных | CSP headers, CORS, rate limiting |
| **API abuse** — DDoS или scraping | Средняя | Недоступность сервиса | Cloudflare WAF (бесплатно), rate limiting |
| **Injection** — SQL/XSS через параметры фильтров | Средняя | Утечка или порча данных | Parameterized queries (D1), input sanitization |
| **MITM** — перехват трафика | Низкая | Утечка данных в транзите | HTTPS/TLS 1.3 (Cloudflare auto) |
| **Insider threat** — злонамеренный оператор МСХ | Средняя | Манипуляция рейтингом | Audit log всех изменений весов, разделение ролей |

---

## 4. Архитектура безопасности

### Уровень 1: Сетевой (Cloudflare)

```
Пользователь
  │
  ▼
Cloudflare Edge (200+ точек мира)
  ├── TLS 1.3 termination
  ├── WAF (Web Application Firewall) — бесплатный tier
  ├── DDoS Protection (L3/L4/L7)
  ├── Bot Management
  └── Rate Limiting (100 req/min per IP)
  │
  ▼
Cloudflare Worker (V8 Isolate)
  ├── Наш Astro SSR + API
  └── D1 Database (SQLite, encrypted at rest)
```

**Ключевое:** нет серверов, нет SSH, нет открытых портов, нет ОС для взлома. 
Worker работает в изолированном V8 sandbox — даже при RCE атакующий получает доступ только к текущему запросу.

### Уровень 2: Приложение

```typescript
// Middleware безопасности (src/middleware.ts)

export async function onRequest({ request }, next) {
  // 1. Rate limiting
  const ip = request.headers.get('CF-Connecting-IP');
  if (!checkRateLimit(ip)) {
    return new Response('Too Many Requests', { status: 429 });
  }

  // 2. Input validation для API routes  
  if (request.url.includes('/api/')) {
    const contentType = request.headers.get('content-type');
    if (request.method === 'POST' && !contentType?.includes('application/json')) {
      return new Response('Bad Request', { status: 400 });
    }
  }

  const response = await next();

  // 3. Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'"
  ].join('; '));

  return response;
}
```

### Уровень 3: Данные

```typescript
// Валидация входных данных (API endpoints)

import { z } from 'zod';  // или ручная валидация

const WeightsSchema = z.object({
  strategic: z.number().min(0).max(0.4),
  fairness: z.number().min(0).max(0.4),
  need: z.number().min(0).max(0.4),
  efficiency: z.number().min(0).max(0.4),
}).refine(
  data => Math.abs(Object.values(data).reduce((a, b) => a + b, 0) - 1.0) < 0.01,
  { message: 'Weights must sum to 1.0' }
);

// D1 queries — всегда parameterized
const stmt = db.prepare(
  'SELECT * FROM applications WHERE region = ? AND status = ? LIMIT ?'
).bind(region, status, limit);
```

### Уровень 4: Аудит (Production roadmap)

```typescript
// Audit log для всех операций изменения весов
interface AuditEntry {
  timestamp: string;
  userId: string;       // ИИН оператора (из ЭЦП)
  action: 'WEIGHT_CHANGE' | 'SHORTLIST_EXPORT' | 'SCORE_RECALC';
  oldValues: Record<string, number>;
  newValues: Record<string, number>;
  ipAddress: string;
  signature: string;    // ЭЦП подтверждение действия
}
```

---

## 5. Приватность данных

### Текущий датасет (хакатон)

| Поле | Содержит ПДн? | Статус |
|---|---|---|
| Номер заявки | ⚠️ Косвенно (первые 11 цифр = producer ID) | Обезличен, но позволяет группировку |
| Область, район | Нет | Публичная география |
| Направление, норматив | Нет | Публичные правила |
| Статус заявки | Нет | Административный |
| Сумма | Нет | Бюджетные средства — публичная информация |
| ИИН/БИН | **Да** | ❌ Отсутствует в датасете (обезличен) |
| ФИО | **Да** | ❌ Отсутствует в датасете |

**Вывод:** текущий датасет **не содержит ПДн** в прямом смысле. Producer ID — это прокси из номера заявки, но без маппинга на ИИН он не является идентификатором личности.

### Production: как работать с ПДн

При реальной интеграции с ГИСС появятся ИИН/БИН. Подход:

```
                      ┌─────────────────────┐
                      │    eGov API шлюз     │
                      │  (ИИН/БИН внутри)   │
                      └──────────┬──────────┘
                                 │ API call
                                 ▼
                      ┌─────────────────────┐
                      │  Scoring Engine      │
                      │  Получает данные     │
                      │  Считает score       │
                      │  НЕ хранит ИИН      │
                      └──────────┬──────────┘
                                 │ score + producer_hash
                                 ▼
                      ┌─────────────────────┐
                      │   D1 / KV Store     │
                      │  hash(ИИН) → score  │
                      │  Нет plaintext ИИН  │
                      └─────────────────────┘
```

**Принцип:** "вычислить и забыть". Scoring Engine получает ИИН для расчёта, сохраняет только `hash(ИИН) → score`. При отображении — запрашивает ФИО из ГИСС через API в момент показа, не кэширует.

---

## 6. Сравнение с текущей инфраструктурой ГИСС

| Аспект | ГИСС (subsidy.plem.kz) | Наша система |
|---|---|---|
| **Авторизация** | ЭЦП + NCALayer | Production: ЭЦП. Хакатон: без auth |
| **Шифрование в транзите** | HTTPS (gov кластер) | TLS 1.3 (Cloudflare) |
| **Шифрование at rest** | Гос. ЦОД (ГТС) | Cloudflare encrypted storage |
| **Аудит действий** | Внутренний (не публичен) | Логирование через Workers |
| **Доступ к данным** | RLS по ИИН/БИН | CORS + API key + rate limit |
| **Сертификация** | Прошла испытания ГТС | Потребуется при интеграции |
| **Хостинг** | Гос. ЦОД (Казахстан) | Cloudflare edge (ближайший PoP — Алматы) |
| **DDoS-защита** | ГТС инфраструктура | Cloudflare WAF (enterprise-grade) |

### Data residency

> **Важный вопрос для жюри:** где физически хранятся данные?

Cloudflare D1 хранит данные в ближайшем регионе. Для Казахстана это может быть PoP в Алматы, но реплики могут быть за рубежом. 

**Для production:** Закон РК требует хранить ПДн граждан на территории РК. Варианты:
1. **D1 с geo-restriction** (Cloudflare поддерживает Data Localization Suite)
2. **Гибрид:** static assets на CF, данные в гос. ЦОД через API
3. **Полный on-premise** — не наш scope, но архитектура позволяет (DataSource абстракция)

Для хакатона: данные обезличены → data residency не применяется.

---

## 7. Checklist безопасности для хакатона

### Реализовать (must have)

- [ ] Security headers middleware (CSP, X-Frame-Options, HSTS)
- [ ] CORS policy (только свой домен)
- [ ] Input validation на всех API endpoints
- [ ] Parameterized queries для D1
- [ ] Rate limiting (100 req/min)

### Упомянуть в презентации

- [ ] ЭЦП-авторизация через NCALayer (production roadmap)
- [ ] Data residency compliance (D1 geo-restriction или гос. ЦОД)
- [ ] Audit logging для операций с весами
- [ ] hash(ИИН) вместо plaintext
- [ ] Соответствие ПП РК №832 (Единые требования ИБ)
- [ ] Соответствие требованиям к системам ИИ (explainability, bias detection)

### Не делать на хакатоне

- OAuth 2.0 / ЭЦП-интеграция (сложно, не нужно для демо)
- Шифрование at rest (Cloudflare делает на уровне инфраструктуры)
- Полный audit trail в БД (достаточно CF Workers Logs)
- Penetration testing

---

## 8. Privacy by Design — принципы

1. **Минимизация данных:** Не храним то, что не нужно для скоринга. Нет ФИО, нет адресов.
2. **Обезличивание:** `producer_id = hash(app_num[:11])`, не plaintext.
3. **Разделение:** Скоринговый движок не имеет доступа к ИИН. Маппинг — только на стороне ГИСС.
4. **Прозрачность:** Формула открыта. Фермер видит, почему его балл такой.
5. **Контроль доступа:** Комиссия МСХ видит всё. Фермер — только свой профиль.
6. **Право на объяснение:** SHAP-визуализация для каждого балла. Требование ПП РК 2026 по ИИ.
