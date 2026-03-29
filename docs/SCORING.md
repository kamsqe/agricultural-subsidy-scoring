# Scoring Model: Дизайн скоринговой системы

Детальное описание трёхслойной scoring-системы AgroScore: математические формулы, веса, примеры расчёта, обоснование каждого компонента.

---

## Философия: Почему НЕ "предсказание отказа"

### Проблема ceiling effect

Наш Information Gain анализ показал:

| Фича | Information Gain | Cumulative |
|---|---|---|
| district | 0.058 bits | 0.058 |
| oblast | 0.041 bits | 0.099 |
| subsidy_code | 0.032 bits | 0.131 |
| month | 0.007 bits | 0.138 |
| **Всё остальное** | <0.005 bits | — |

**Вывод:** все наши фичи вместе объясняют ~31% rejection variance. Остальные 69% — невидимые факторы:
- Качество документов (сканы, справки)
- Автоматические проверки ГИСС (интеграция с ИСЖ, ИБСПР, налоговой)
- Субъективное решение инспектора МИО

Predictor отказов с AUC > 0.75 **невозможен** на этих данных. Любая команда, которая заявит "мы предсказываем отказы с 90% точностью" — либо переобучилась, либо врёт.

### Альтернативный подход: Impact Scoring

Вместо предсказания "кого отклонят" (бессмысленно), мы ранжируем **уже одобренных** по потенциальному эффекту:

| Пул | Количество | Что делаем |
|---|---|---|
| Исполнена + Одобрена | 28,627 | Ретроспективный анализ: кто получил максимальный ROI? |
| Сформировано поручение | 2,854 | **Главный use case**: кого из очереди финансировать первым? |
| Отклонена | 2,909 | Анализ причин для Pre-Check |

---

## Слой 1: Eligibility Pre-Check (Rule-Based)

### Назначение
Проверка заявки **ДО подачи** по формальным критериям из Приложения 2 Правил субсидирования. Цель — убрать 65% retry-отказов.

### Правила (извлечены из PDF)

```python
class EligibilityChecker:
    """
    Rule-based проверка по Приложению 2 Правил субсидирования.
    Возвращает список нарушений с рекомендациями по исправлению.
    """
    
    def check_cattle_purchase(self, application: dict) -> list[Issue]:
        issues = []
        
        # Правило 1: Учётный номер
        if not application.get('bin_iin'):
            issues.append(Issue(
                code='NO_BIN',
                severity='blocking',
                message='Отсутствует БИН/ИИН',
                fix='Зарегистрируйтесь как ИП или КХ'
            ))
        
        # Правило 2: Регистрация в ИСЖ
        if not application.get('isj_registered'):
            issues.append(Issue(
                code='NO_ISJ',
                severity='blocking', 
                message='Скот не зарегистрирован в ИСЖ',
                fix='Зарегистрируйте животных на isj.gov.kz'
            ))
        
        # Правило 3: Возраст скота (4-18 месяцев для молодняка)
        age_months = application.get('cattle_age_months', 0)
        if not (4 <= age_months <= 18):
            issues.append(Issue(
                code='INVALID_AGE',
                severity='blocking',
                message=f'Возраст скота {age_months} мес. вне диапазона 4-18',
                fix='Субсидия доступна только для молодняка 4-18 месяцев'
            ))
        
        # Правило 4: Соотношение быков к маткам (1:20-30)
        bulls = application.get('bulls_count', 0)
        cows = application.get('cows_count', 0)
        if bulls > 0 and cows > 0:
            ratio = cows / bulls
            if not (20 <= ratio <= 30):
                issues.append(Issue(
                    code='INVALID_RATIO',
                    severity='warning',
                    message=f'Соотношение быков к маткам 1:{ratio:.0f} (норма 1:20-30)',
                    fix='Скорректируйте поголовье или обоснуйте отклонение'
                ))
        
        # Правило 5: Наличие земли
        if not application.get('has_land'):
            issues.append(Issue(
                code='NO_LAND',
                severity='blocking',
                message='Нет земельного участка',
                fix='Оформите землю или договор аренды'
            ))
        
        return issues
```

### Матрица правил по типам субсидий

| Тип субсидии | Код | Обязательные проверки |
|---|---|---|
| Покупка КРС | 00400 | БИН + ИСЖ + возраст + земля |
| Покупка быков | 00700 | БИН + ИБСПР + племенное свидетельство |
| Молоко | 02000 | БИН + ветсправка + договор с переработчиком |
| Селекционная работа | 01300 | БИН + ИБСПР + план селекции |
| Корма (ЧС) | 04000 | БИН + акт о ЧС от акимата |

### Ожидаемый эффект

```
Текущее состояние:
- 36,651 заявок → 2,909 отказов (9.2%)
- Из них 65% = retry одного фермера

С Pre-Check:
- Фермер видит проблему ДО подачи
- Исправляет и подаёт 1 раз
- Ожидаемое снижение retry: 65% → 15%
- Экономия времени инспекторов: ~1,500 заявок/год
```

---

## Слой 2: Impact Score (ML-Based)

### Архитектура: Ансамбль моделей

**Почему ансамбль?** Simpson's Paradox доказан на данных:

```
Гипотеза: "Крупные хозяйства отклоняют чаще"

Общий датасет:
  Крупные (>500 голов): 12.1% reject
  Мелкие (<50 голов):   8.3% reject
  → Кажется, крупных отклоняют чаще

Контроль по типу субсидии:
  Покупка КРС (00400):
    Крупные: 18.2% reject
    Мелкие: 11.4% reject
    → Да, крупных отклоняют чаще
  
  Молоко (02000):
    Крупные: 6.1% reject  
    Мелкие: 9.8% reject
    → Нет, мелких отклоняют чаще!
  
  Селекция (01300):
    Крупные: 0.9% reject
    Мелкие: 0.7% reject
    → Разницы нет
```

**Вывод:** одна модель на все типы даёт мусорные паттерны. Нужен ансамбль.

### Категории моделей

| Категория | Коды | N заявок | Модель | Ключевые фичи |
|---|---|---|---|---|
| **Acquisition** | 00100-00400, 00700 | 8,234 | XGBoost | district_risk, purchase_size, specialization_match |
| **Production** | 01900, 02000, 04500, 04800 | 15,891 | XGBoost | volume_efficiency, district_capacity, seasonal_factor |
| **Breeding** | 01200, 01300 | 9,456 | Minimal (baseline) | Почти все одобряются |
| **Emergency** | 04000, 11500, 11600 | 3,070 | Rule-based | has_emergency_act, affected_area |

### Impact Score Formula

```python
def calculate_impact_score(application: dict, category: str) -> float:
    """
    Impact Score ∈ [0, 100]
    
    Формула:
    Score = w1×Strategic + w2×Fairness + w3×Need + w4×Efficiency
    
    Веса калиброваны на исторических данных (2023-2024)
    """
    
    # Веса по категориям (сумма = 1.0)
    WEIGHTS = {
        'acquisition': {'strategic': 0.30, 'fairness': 0.25, 'need': 0.25, 'efficiency': 0.20},
        'production':  {'strategic': 0.25, 'fairness': 0.20, 'need': 0.30, 'efficiency': 0.25},
        'breeding':    {'strategic': 0.40, 'fairness': 0.15, 'need': 0.20, 'efficiency': 0.25},
        'emergency':   {'strategic': 0.10, 'fairness': 0.10, 'need': 0.70, 'efficiency': 0.10},
    }
    
    w = WEIGHTS[category]
    
    # Компонент 1: Strategic Alignment [0-100]
    strategic = calculate_strategic_alignment(application)
    
    # Компонент 2: Fairness Factor [0-100]
    fairness = calculate_fairness_factor(application)
    
    # Компонент 3: Regional Need [0-100]
    need = calculate_regional_need(application)
    
    # Компонент 4: Efficiency Potential [0-100]
    efficiency = calculate_efficiency_potential(application)
    
    score = (
        w['strategic'] * strategic +
        w['fairness'] * fairness +
        w['need'] * need +
        w['efficiency'] * efficiency
    )
    
    return round(score, 1)
```

### Компонент 1: Strategic Alignment (0-100)

**Что измеряем:** Насколько субсидия соответствует стратегическим приоритетам региона и страны.

```python
def calculate_strategic_alignment(app: dict) -> float:
    """
    Факторы:
    1. Региональная специализация (из данных)
    2. Приоритеты Концепции АПК 2021-2030
    3. Продовольственная безопасность
    """
    
    # Фактор 1: Региональная специализация
    # Из PATTERNS.md: Мангистау = коневодство (9.1x), Алматы = птица (4.6x)
    specialization_idx = get_regional_specialization(
        oblast=app['oblast'],
        subsidy_type=app['subsidy_code']
    )
    # Нормализация: idx > 2.0 = высокая специализация
    spec_score = min(specialization_idx / 2.0, 1.0) * 40  # max 40 points
    
    # Фактор 2: Приоритеты Концепции АПК
    # Приоритеты: переработка, экспорт, племенная работа
    priority_codes = ['01300', '01200', '02000', '04500']  # селекция, молоко, мясо
    priority_score = 30 if app['subsidy_code'] in priority_codes else 15
    
    # Фактор 3: Продовольственная безопасность
    # Самообеспеченность КЗ: говядина 82%, молоко 89%, птица 58%
    food_security = {
        'cattle': 20,   # говядина — почти достаточно
        'dairy': 25,    # молоко — приоритет
        'poultry': 30,  # птица — дефицит, высокий приоритет
        'sheep': 15,    # баранина — экспорт
    }
    fs_score = food_security.get(app['direction'], 15)
    
    return spec_score + priority_score + fs_score  # max 100
```

**Пример расчёта:**

```
Заявка: Покупка КРС в Мангистауской области (коневодство регион)
- specialization_idx для КРС в Мангистау = 0.3 (низкая)
- spec_score = min(0.3/2.0, 1.0) × 40 = 6 points
- priority_score = 15 (не приоритетный код)
- fs_score = 20 (говядина)
- Strategic Alignment = 6 + 15 + 20 = 41/100

Заявка: Молоко в Алматинской области
- specialization_idx для молока в Алматы = 1.8
- spec_score = min(1.8/2.0, 1.0) × 40 = 36 points
- priority_score = 30 (код 02000 в приоритетах)
- fs_score = 25 (молоко)
- Strategic Alignment = 36 + 30 + 25 = 91/100
```

### Компонент 2: Fairness Factor (0-100)

**Что измеряем:** Не монополизирован ли район, справедливо ли распределение.

```python
def calculate_fairness_factor(app: dict) -> float:
    """
    Факторы:
    1. Monopoly index района (из данных: Тюлькубас = 86% одному)
    2. Gini coefficient района
    3. Размер хозяйства vs медиана района
    """
    
    district = app['district']
    
    # Фактор 1: Monopoly index
    # monopoly_idx = доля топ-1 получателя в районе
    # Тюлькубас: 86%, Казталовский: 0.9%
    monopoly_idx = get_district_monopoly_index(district)
    
    # Если район уже монополизирован, новые заявки от других = высокий fairness
    if app['is_top_recipient']:
        monopoly_score = max(0, 50 - monopoly_idx * 50)  # топ-получатель штрафуется
    else:
        monopoly_score = min(monopoly_idx * 50, 50)  # не-топ получает бонус
    
    # Фактор 2: Gini coefficient
    gini = get_district_gini(district)
    # Высокий Gini (>0.6) = неравенство, новые мелкие = бонус
    gini_score = (1 - gini) * 30  # max 30 points
    
    # Фактор 3: Размер vs медиана
    median_volume = get_district_median_volume(district, app['subsidy_code'])
    ratio = app['volume'] / median_volume if median_volume > 0 else 1.0
    
    # Около медианы = хорошо, сильно выше = штраф
    if ratio < 0.5:
        size_score = 15  # мелкий = поддержка
    elif ratio < 2.0:
        size_score = 20  # средний = норма
    else:
        size_score = 10  # крупный = меньше бонус
    
    return monopoly_score + gini_score + size_score  # max 100
```

**Пример:**

```
Заявка: Новый фермер в Тюлькубасском районе (monopoly_idx = 0.86)
- is_top_recipient = False
- monopoly_score = min(0.86 × 50, 50) = 43 points (бонус за разбавление монополии)
- gini = 0.72, gini_score = (1-0.72) × 30 = 8.4 points
- ratio = 0.3 (мелкий), size_score = 15 points
- Fairness Factor = 43 + 8.4 + 15 = 66.4/100

Заявка: Топ-получатель в том же районе (ещё одна заявка)
- is_top_recipient = True
- monopoly_score = max(0, 50 - 0.86 × 50) = 7 points (штраф)
- gini_score = 8.4
- ratio = 5.0 (крупный), size_score = 10
- Fairness Factor = 7 + 8.4 + 10 = 25.4/100
```

### Компонент 3: Regional Need (0-100)

**Что измеряем:** Насколько региону нужна эта субсидия.

```python
def calculate_regional_need(app: dict) -> float:
    """
    Факторы:
    1. Бюджетная обеспеченность области
    2. Очередь ожидания (backlog)
    3. Сезонность
    """
    
    oblast = app['oblast']
    month = app['month']
    
    # Фактор 1: Бюджетная обеспеченность
    # Акмолинская: 50.7% заявок в "ожидании" = дефицит
    # Павлодар: 2.1% в ожидании = профицит
    backlog_ratio = get_oblast_backlog_ratio(oblast)
    budget_score = min(backlog_ratio * 100, 50)  # max 50 points
    
    # Фактор 2: Плотность заявок (активность района)
    # Высокая активность = высокая потребность
    activity_percentile = get_district_activity_percentile(app['district'])
    activity_score = activity_percentile * 30  # max 30 points
    
    # Фактор 3: Сезонность
    # Февраль-апрель: посевная, высокая потребность
    # Август: уборка, пик отказов (бюджет исчерпан)
    seasonal_need = {
        1: 0.7, 2: 0.9, 3: 1.0, 4: 1.0,  # весна = высокая
        5: 0.8, 6: 0.7, 7: 0.6, 8: 0.5,  # лето = средняя
        9: 0.6, 10: 0.7, 11: 0.8, 12: 0.8  # осень-зима = средняя
    }
    seasonal_score = seasonal_need.get(month, 0.7) * 20  # max 20 points
    
    return budget_score + activity_score + seasonal_score  # max 100
```

### Компонент 4: Efficiency Potential (0-100)

**Что измеряем:** Вероятность эффективного использования субсидии.

```python
def calculate_efficiency_potential(app: dict) -> float:
    """
    Факторы:
    1. История заявок (first-timer vs retry)
    2. Репутация района
    3. Размер заявки vs норматив
    """
    
    # Фактор 1: История
    # First-timer = неизвестно, нейтрально
    # Успешный retry = упорный фермер, бонус
    # Многократный retry без успеха = проблемный
    retry_count = app.get('retry_count', 0)
    if retry_count == 0:
        history_score = 30  # first-timer
    elif retry_count == 1:
        history_score = 35  # один retry = нормально
    elif retry_count <= 3:
        history_score = 25  # несколько retry = настораживает
    else:
        history_score = 15  # много retry = проблема
    
    # Фактор 2: Репутация района
    # r=0.65 корреляция между district_reject_rate и будущими отказами
    district_reject_rate = get_district_reject_rate(app['district'])
    # Инвертируем: низкий reject = высокий score
    reputation_score = (1 - district_reject_rate) * 40  # max 40 points
    
    # Фактор 3: Размер заявки
    # Слишком маленькая = неэффективно
    # Слишком большая = риск
    # Оптимум = 50-150% от норматива
    norm_ratio = app['sum'] / (app['norm'] * app['volume'])
    if 0.5 <= norm_ratio <= 1.5:
        size_score = 30
    elif 0.3 <= norm_ratio <= 2.0:
        size_score = 20
    else:
        size_score = 10
    
    return history_score + reputation_score + size_score  # max 100
```

---

## Слой 3: Fairness Score (Constraint Layer)

### Назначение
Пост-процессинг для гарантии справедливости распределения. Работает поверх Impact Score.

### Constraints

```python
class FairnessConstraints:
    """
    Hard и soft constraints для финального ранжирования.
    """
    
    # Hard constraints (нарушение = дисквалификация)
    MAX_SINGLE_RECIPIENT_SHARE = 0.15  # макс 15% бюджета одному
    MAX_DISTRICT_SHARE = 0.10  # макс 10% бюджета одному району
    MIN_SMALL_FARMER_SHARE = 0.30  # мин 30% бюджета мелким (<50 голов)
    
    # Soft constraints (штраф к score)
    CONCENTRATION_PENALTY = 0.1  # -10% score за каждые 5% выше порога
    REPEAT_PENALTY = 0.05  # -5% score за повторную заявку в том же году
    
    def apply_constraints(self, ranked_list: list, budget: float) -> list:
        """
        Применяет constraints к отсортированному по Impact Score списку.
        Возвращает финальный ранжированный список.
        """
        allocated = defaultdict(float)
        small_farmer_allocated = 0.0
        result = []
        
        for app in ranked_list:
            recipient_id = app['recipient_id']
            district = app['district']
            amount = app['sum']
            
            # Hard constraint 1: Single recipient cap
            if allocated[recipient_id] + amount > budget * self.MAX_SINGLE_RECIPIENT_SHARE:
                app['constraint_violation'] = 'MAX_SINGLE_RECIPIENT'
                continue
            
            # Hard constraint 2: District cap
            if allocated[district] + amount > budget * self.MAX_DISTRICT_SHARE:
                app['constraint_violation'] = 'MAX_DISTRICT'
                continue
            
            # Soft constraint: Concentration penalty
            recipient_share = allocated[recipient_id] / budget if budget > 0 else 0
            if recipient_share > 0.05:
                penalty = (recipient_share - 0.05) / 0.05 * self.CONCENTRATION_PENALTY
                app['adjusted_score'] = app['impact_score'] * (1 - penalty)
            
            allocated[recipient_id] += amount
            allocated[district] += amount
            if app['is_small_farmer']:
                small_farmer_allocated += amount
            
            result.append(app)
        
        # Hard constraint 3: Small farmer minimum
        if small_farmer_allocated < budget * self.MIN_SMALL_FARMER_SHARE:
            # Re-rank to prioritize small farmers
            result = self._boost_small_farmers(result, budget, small_farmer_allocated)
        
        return result
```

---

## Explainability: Три уровня

### Уровень 1: Summary (для комиссии)

```json
{
  "application_id": "01300100258072",
  "impact_score": 78.4,
  "rank": 142,
  "top_factors": [
    {"factor": "Региональная специализация", "contribution": "+18.2", "direction": "positive"},
    {"factor": "Низкая монополизация района", "contribution": "+12.5", "direction": "positive"},
    {"factor": "Сезонный дефицит бюджета", "contribution": "-8.1", "direction": "negative"}
  ],
  "recommendation": "APPROVE",
  "confidence": 0.82
}
```

### Уровень 2: Detail (для аналитика)

SHAP waterfall chart со всеми фичами:

```
Base value: 50.0
─────────────────────────────────────────────────
district_specialization_idx    +12.3  ████████████▶
is_small_farmer                 +8.7  ████████▶
district_reject_rate            +6.2  ██████▶
month_budget_pressure           +5.1  █████▶
retry_count                     -3.4  ◀███
oblast_backlog_ratio            +4.8  ████▶
subsidy_code_priority           +3.2  ███▶
volume_vs_median                -1.5  ◀█
─────────────────────────────────────────────────
Final prediction: 78.4
```

### Уровень 3: Counterfactual (для фермера)

```json
{
  "current_score": 52.3,
  "current_rank": 1847,
  "improvements": [
    {
      "action": "Зарегистрируйте скот в ИБСПР (племенной учёт)",
      "score_increase": "+15.2",
      "new_rank": "~800",
      "difficulty": "medium",
      "time_required": "2-3 недели"
    },
    {
      "action": "Подайте заявку в феврале-марте (до исчерпания бюджета)",
      "score_increase": "+8.1",
      "new_rank": "~1200",
      "difficulty": "easy",
      "time_required": "дождаться сезона"
    },
    {
      "action": "Увеличьте поголовье до 50+ голов",
      "score_increase": "+5.4",
      "new_rank": "~1500",
      "difficulty": "hard",
      "time_required": "6-12 месяцев"
    }
  ]
}
```

---

## Валидация модели

### Backtesting на исторических данных

```python
def backtest_scoring_model(historical_data: pd.DataFrame) -> dict:
    """
    Валидация: если бы мы применили Impact Score к 2024 году,
    как бы изменилось распределение?
    """
    
    # Метрика 1: Gini coefficient (должен снизиться)
    current_gini = calculate_gini(historical_data['sum'])
    scored_data = apply_impact_scoring(historical_data)
    new_gini = calculate_gini(scored_data['sum'])
    
    # Метрика 2: Regional balance (должен улучшиться)
    current_cv = historical_data.groupby('oblast')['sum'].sum().std() / \
                 historical_data.groupby('oblast')['sum'].sum().mean()
    new_cv = scored_data.groupby('oblast')['sum'].sum().std() / \
             scored_data.groupby('oblast')['sum'].sum().mean()
    
    # Метрика 3: Small farmer share (должна вырасти)
    current_small = historical_data[historical_data['volume'] < 50]['sum'].sum() / \
                    historical_data['sum'].sum()
    new_small = scored_data[scored_data['volume'] < 50]['sum'].sum() / \
                scored_data['sum'].sum()
    
    return {
        'gini_improvement': current_gini - new_gini,  # target: > 0.05
        'regional_balance_improvement': current_cv - new_cv,  # target: > 0.1
        'small_farmer_share_increase': new_small - current_small,  # target: > 0.05
    }
```

### Ожидаемые результаты

| Метрика | Текущее (FIFO) | С Impact Score | Улучшение |
|---|---|---|---|
| Gini coefficient | 0.68 | 0.55 | -0.13 |
| Regional CV | 0.42 | 0.31 | -0.11 |
| Small farmer share | 24% | 32% | +8% |
| Monopoly districts | 12 | 4 | -8 |

---

## Ограничения модели (честно)

1. **69% variance unexplained** — мы не можем предсказать решение инспектора
2. **Нет финансовых данных** — ПКБ, налоговая не интегрированы
3. **Нет данных о результатах** — не знаем, кто эффективно использовал субсидию
4. **Proxy для farmer_id** — используем (район + тип + сумма), не 100% точно
5. **Веса требуют калибровки** — текущие веса = экспертная оценка, нужен A/B тест

---

## Impact Score v2: Расширенная модель

### Обоснование обновления

На основе 12 волн исследования fairness и антикоррупционных механизмов, Impact Score расширен с 4 до 6 компонентов:

| Версия | Компоненты | Обоснование |
|---|---|---|
| **v1** | Strategic, Fairness, Need, Efficiency | Базовая модель |
| **v2** | + Mission, + Fraud Risk | Соответствие целям АПК + предотвращение fraud |

### Impact Score v2 Formula

```python
def calculate_impact_score_v2(application: dict) -> dict:
    """
    Impact Score v2 ∈ [0, 100]
    
    Формула:
    Score = w1×Strategic + w2×Fairness + w3×Need + w4×Efficiency + w5×Mission - w6×FraudRisk
    
    Новое в v2:
    - Mission Alignment: соответствие целям Концепции АПК 2021-2030
    - Fraud Risk: штраф за аномалии и red flags
    """
    
    # Базовые компоненты (из v1)
    strategic = calculate_strategic_alignment(application)  # 0-100
    fairness = calculate_fairness_factor(application)       # 0-100
    need = calculate_regional_need(application)             # 0-100
    efficiency = calculate_efficiency_potential(application) # 0-100
    
    # Новые компоненты (v2)
    mission = calculate_mission_alignment(application)      # 0-100
    fraud_risk = calculate_fraud_risk_score(application)    # 0-100
    
    # Веса v2
    weights = {
        'strategic': 0.20,
        'fairness': 0.20,
        'need': 0.15,
        'efficiency': 0.15,
        'mission': 0.20,
        'fraud_penalty': 0.10,
    }
    
    # Финальный score
    base_score = (
        weights['strategic'] * strategic +
        weights['fairness'] * fairness +
        weights['need'] * need +
        weights['efficiency'] * efficiency +
        weights['mission'] * mission
    )
    
    # Fraud penalty (вычитается)
    fraud_penalty = weights['fraud_penalty'] * fraud_risk
    
    final_score = max(0, base_score - fraud_penalty)
    
    return {
        'final_score': round(final_score, 1),
        'components': {
            'strategic': strategic,
            'fairness': fairness,
            'need': need,
            'efficiency': efficiency,
            'mission': mission,
            'fraud_risk': fraud_risk,
        },
        'flags': {
            'high_fraud_risk': fraud_risk > 50,
            'low_mission_alignment': mission < 30,
            'requires_audit': fraud_risk > 70,
        }
    }
```

---

## Компонент 5: Mission Alignment Score (0-100) — НОВОЕ

### Что измеряем

Насколько заявка соответствует официальным целям Концепции АПК 2021-2030:
- Продовольственная безопасность
- Поддержка мелких фермеров
- Региональное развитие
- Рост продуктивности
- Модернизация

### Формула

```python
def calculate_mission_alignment(application: dict) -> float:
    """
    Mission Alignment Score ∈ [0, 100]
    Насколько заявка соответствует миссии субсидирования
    """
    
    alignment_factors = {
        # Продовольственная безопасность (приоритет: птица > молоко > говядина)
        'food_security_priority': get_food_security_score(application) * 25,
        
        # Поддержка мелких фермеров (Rawlsian maximin)
        'small_farmer_bonus': is_small_farmer(application) * 20,
        
        # Региональное развитие (недофинансированные регионы)
        'underserved_region': is_underserved_region(application) * 20,
        
        # Рост продуктивности (потенциал улучшения)
        'productivity_potential': get_productivity_potential(application) * 20,
        
        # Модернизация (элементы современного хозяйства)
        'modernization_element': has_modernization(application) * 15,
    }
    
    return sum(alignment_factors.values())
```

### Детализация факторов

#### Food Security Priority (max 25 points)

```python
def get_food_security_score(app: dict) -> float:
    """
    Приоритет по продовольственной безопасности.
    Самообеспеченность КЗ: говядина 82%, молоко 89%, птица 58%
    → Птица = высший приоритет
    """
    FOOD_SECURITY_PRIORITIES = {
        'poultry': 1.0,    # 58% самообеспеченность — критический дефицит
        'dairy': 0.8,      # 89% — приоритет
        'cattle': 0.6,     # 82% — средний
        'sheep': 0.4,      # экспортный товар
        'other': 0.3,
    }
    direction = get_direction(app['subsidy_code'])
    return FOOD_SECURITY_PRIORITIES.get(direction, 0.3)
```

#### Small Farmer Bonus (max 20 points)

```python
def is_small_farmer(app: dict) -> float:
    """
    Бонус для мелких фермеров (Rawlsian fairness).
    Мелкий = <50 голов или <10 млн тенге
    """
    volume = app.get('volume', 0)
    amount = app.get('sum', 0)
    
    if volume < 20 or amount < 5_000_000:
        return 1.0  # очень мелкий
    elif volume < 50 or amount < 10_000_000:
        return 0.7  # мелкий
    elif volume < 200 or amount < 50_000_000:
        return 0.3  # средний
    else:
        return 0.0  # крупный — нет бонуса
```

#### Underserved Region (max 20 points)

```python
def is_underserved_region(app: dict) -> float:
    """
    Бонус для недофинансированных регионов.
    Акмолинская: 50.7% в ожидании = высокий приоритет
    Павлодарская: 2.1% = низкий приоритет
    """
    backlog_ratio = get_oblast_backlog_ratio(app['oblast'])
    
    if backlog_ratio > 0.4:
        return 1.0  # критический дефицит
    elif backlog_ratio > 0.2:
        return 0.6  # высокий дефицит
    elif backlog_ratio > 0.1:
        return 0.3  # умеренный
    else:
        return 0.0  # профицит — нет бонуса
```

---

## Компонент 6: Fraud Risk Score (0-100) — НОВОЕ

### Что измеряем

Вероятность мошенничества или неэффективного использования субсидии на основе аномалий и red flags.

### Формула

```python
def calculate_fraud_risk_score(application: dict) -> float:
    """
    Fraud Risk Score ∈ [0, 100]
    Высокий score = высокий риск fraud
    """
    
    risk_factors = {
        # Аномалии в заявке
        'volume_outlier': is_volume_outlier(application) * 20,
        'round_number': is_round_number(application['sum']) * 10,
        'weekend_submission': is_weekend(application['date']) * 5,
        
        # Паттерны поведения
        'high_retry_velocity': get_retry_velocity(application) * 15,
        'multi_district': has_multi_district(application['bin']) * 25,
        
        # Контекст
        'high_monopoly_district': get_district_monopoly(application) * 15,
        'seasonal_anomaly': is_seasonal_anomaly(application) * 10,
    }
    
    return min(sum(risk_factors.values()), 100)
```

### Детализация факторов

#### Volume Outlier (max 20 points)

```python
def is_volume_outlier(app: dict) -> float:
    """
    Аномально большой или маленький объём для района+типа.
    Z-score > 3 = outlier
    """
    z_score = calculate_zscore(
        value=app['volume'],
        group_key=(app['district'], app['subsidy_code'])
    )
    
    if abs(z_score) > 3:
        return 1.0  # сильный outlier
    elif abs(z_score) > 2:
        return 0.5  # умеренный
    else:
        return 0.0  # норма
```

#### Multi-District Flag (max 25 points)

```python
def has_multi_district(bin_iin: str) -> float:
    """
    Один БИН подаёт заявки из разных районов.
    Возможно: shell companies, обход лимитов.
    """
    districts = get_districts_for_bin(bin_iin)
    
    if len(districts) > 3:
        return 1.0  # высокий риск
    elif len(districts) > 1:
        return 0.5  # подозрительно
    else:
        return 0.0  # норма
```

#### Round Number Flag (max 10 points)

```python
def is_round_number(amount: float) -> float:
    """
    Подозрительно круглые числа (100, 500, 1000).
    Может указывать на фиктивные данные.
    """
    # Проверяем кратность
    if amount % 1_000_000 == 0:
        return 0.8  # очень круглое
    elif amount % 100_000 == 0:
        return 0.4  # круглое
    elif amount % 10_000 == 0:
        return 0.2  # немного круглое
    else:
        return 0.0  # норма
```

### Fraud Risk Flags

```python
FRAUD_FLAGS = {
    'high_fraud_risk': fraud_risk > 50,      # Требует внимания
    'requires_audit': fraud_risk > 70,       # Обязательная проверка
    'auto_reject': fraud_risk > 90,          # Автоматический отказ (опционально)
}
```

---

## Сравнение v1 vs v2

| Аспект | Impact Score v1 | Impact Score v2 |
|---|---|---|
| **Компоненты** | 4 | 6 |
| **Веса** | Фиксированные по категориям | Единые + штраф |
| **Mission** | Косвенно в Strategic | Отдельный компонент |
| **Fraud** | Нет | Штраф до -10 points |
| **Flags** | Нет | 3 флага (high_risk, low_mission, audit) |
| **Explainability** | SHAP | SHAP + flags + recommendations |

### Пример расчёта v2

```
Заявка: Покупка КРС, Акмолинская область, мелкий фермер

Компоненты:
- Strategic Alignment: 65 (средняя специализация)
- Fairness Factor: 72 (не монополист)
- Regional Need: 85 (высокий backlog)
- Efficiency Potential: 60 (first-timer)
- Mission Alignment: 78 (мелкий + дефицитный регион)
- Fraud Risk: 15 (небольшой outlier)

Расчёт:
base_score = 0.20×65 + 0.20×72 + 0.15×85 + 0.15×60 + 0.20×78
           = 13.0 + 14.4 + 12.75 + 9.0 + 15.6
           = 64.75

fraud_penalty = 0.10 × 15 = 1.5

final_score = 64.75 - 1.5 = 63.25

Flags:
- high_fraud_risk: False (15 < 50)
- low_mission_alignment: False (78 > 30)
- requires_audit: False (15 < 70)
```

---

## Критический аудит модели

### Известные ограничения

| Ограничение | Влияние | Митигация |
|---|---|---|
| **Произвольные веса** | Score может не отражать реальную ценность | Калибровка на A/B тесте |
| **Непроверенные формулы** | Нелогичные результаты на edge cases | Sensitivity analysis |
| **Нет backtesting** | Не знаем, улучшит ли распределение | Симуляция на исторических данных |
| **False positives в fraud** | Честные фермеры получат штраф | Настройка порогов |
| **Gaming** | Механизмы можно обойти | Регулярное обновление правил |

### Что нужно сделать

1. **До хакатона:**
   - Backtesting на исторических данных
   - Sensitivity analysis весов
   - Проверка edge cases
   - Оценка false positive rate

2. **После хакатона:**
   - A/B тест в одном районе
   - Интервью с фермерами
   - Калибровка весов на реальных данных
   - Интеграция с ПКБ для Efficiency

### Честный disclaimer

```
⚠️ ОГРАНИЧЕНИЯ IMPACT SCORE v2:

1. Веса НЕ калиброваны на реальных данных
2. Формулы НЕ валидированы эмпирически
3. Fraud detection может давать false positives
4. Mission Alignment основан на интерпретации Концепции АПК
5. Требуется A/B тест для подтверждения эффективности
```
