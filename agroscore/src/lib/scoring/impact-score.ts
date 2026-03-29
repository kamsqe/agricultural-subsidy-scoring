/**
 * Impact Score Calculator
 * 
 * Rule-based scoring system (no ML training required).
 * Same interface as future ML-based scoring for easy migration.
 */

import type { PreCheckInput, PreCheckResult, ScoreComponents, Factor, PreCheckIssue, Recommendation } from '../types';

// Score weights (sum to 1.0)
const WEIGHTS = {
  strategic_alignment: 0.20,
  fairness_factor: 0.20,
  regional_need: 0.15,
  efficiency_potential: 0.15,
  mission_alignment: 0.20,
  fraud_penalty: -0.10
};

// Oblast priority based on agricultural development needs
const OBLAST_PRIORITY: Record<string, number> = {
  'Туркестанская область': 0.9,
  'Алматинская область': 0.85,
  'Жамбылская область': 0.85,
  'Кызылординская область': 0.8,
  'Восточно-Казахстанская область': 0.75,
  'Северо-Казахстанская область': 0.75,
  'Акмолинская область': 0.7,
  'Костанайская область': 0.7,
  'Павлодарская область': 0.65,
  'Карагандинская область': 0.65,
  'Западно-Казахстанская область': 0.6,
  'Актюбинская область': 0.6,
  'Атырауская область': 0.55,
  'Мангистауская область': 0.5,
  'Улытауская область': 0.7,
  'Абай область': 0.75,
  'Жетісу область': 0.8
};

// Subsidy category priorities (food security)
const SUBSIDY_PRIORITY: Record<string, number> = {
  'livestock_purchase': 0.9,  // КРС покупка - высокий приоритет
  'milk': 0.85,               // Молоко
  'breeding': 0.8,            // Племенное
  'other': 0.6
};

// Small farmer thresholds
const SMALL_FARMER_VOLUME_THRESHOLD = 50; // голов
const SMALL_FARMER_SUM_THRESHOLD = 5_000_000; // тенге

/**
 * Calculate Impact Score for a pre-check input
 */
export function calculateImpactScore(input: PreCheckInput): {
  score: number;
  components: ScoreComponents;
  factors: Factor[];
} {
  const components = calculateComponents(input);
  
  // Calculate weighted score
  const score = 
    components.strategic_alignment * WEIGHTS.strategic_alignment +
    components.fairness_factor * WEIGHTS.fairness_factor +
    components.regional_need * WEIGHTS.regional_need +
    components.efficiency_potential * WEIGHTS.efficiency_potential +
    components.mission_alignment * WEIGHTS.mission_alignment +
    components.fraud_penalty * WEIGHTS.fraud_penalty;
  
  // Normalize to 0-100
  const normalizedScore = Math.max(0, Math.min(100, score));
  
  // Generate top factors
  const factors = generateFactors(components, input);
  
  return {
    score: normalizedScore,
    components,
    factors
  };
}

function calculateComponents(input: PreCheckInput): ScoreComponents {
  const isSmallFarmer = input.volume < SMALL_FARMER_VOLUME_THRESHOLD || 
                        input.sum < SMALL_FARMER_SUM_THRESHOLD;
  
  // Strategic Alignment: Does this align with national priorities?
  const subsidyCategory = getSubsidyCategory(input.subsidy_code);
  const subsidyPriority = SUBSIDY_PRIORITY[subsidyCategory] || 0.5;
  const strategic_alignment = subsidyPriority * 100;
  
  // Fairness Factor: Prioritize small farmers (Rawlsian fairness)
  const fairness_factor = isSmallFarmer ? 85 : 50;
  
  // Regional Need: Underserved regions get priority
  const oblastPriority = OBLAST_PRIORITY[input.oblast] || 0.5;
  const regional_need = oblastPriority * 100;
  
  // Efficiency Potential: Volume-to-sum ratio
  const avgSumPerHead = input.sum / Math.max(input.volume, 1);
  const efficiencyRatio = Math.min(1, 150000 / avgSumPerHead); // Baseline: 150K per head
  const efficiency_potential = efficiencyRatio * 100;
  
  // Mission Alignment: Composite of food security + development goals
  const mission_alignment = (strategic_alignment + regional_need) / 2;
  
  // Fraud Penalty: Start at 0, could be increased based on red flags
  // For pre-check, we assume no fraud indicators
  const fraud_penalty = 0;
  
  return {
    strategic_alignment,
    fairness_factor,
    regional_need,
    efficiency_potential,
    mission_alignment,
    fraud_penalty
  };
}

function generateFactors(components: ScoreComponents, input: PreCheckInput): Factor[] {
  const factors: Factor[] = [];
  const isSmallFarmer = input.volume < SMALL_FARMER_VOLUME_THRESHOLD;
  
  // Strategic alignment
  factors.push({
    name: 'Приоритет направления',
    contribution: (components.strategic_alignment - 50) * WEIGHTS.strategic_alignment,
    direction: components.strategic_alignment > 50 ? 'positive' : 'negative',
    description: `Категория субсидии: ${getSubsidyCategory(input.subsidy_code)}`
  });
  
  // Small farmer bonus
  if (isSmallFarmer) {
    factors.push({
      name: 'Малое хозяйство',
      contribution: 35 * WEIGHTS.fairness_factor,
      direction: 'positive',
      description: 'Приоритет для мелких фермеров'
    });
  }
  
  // Regional priority
  const oblastPriority = OBLAST_PRIORITY[input.oblast] || 0.5;
  factors.push({
    name: 'Региональный приоритет',
    contribution: (oblastPriority - 0.5) * 100 * WEIGHTS.regional_need,
    direction: oblastPriority > 0.5 ? 'positive' : 'negative',
    description: `Область: ${input.oblast}`
  });
  
  // Sort by absolute contribution
  factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  
  return factors.slice(0, 5);
}

function getSubsidyCategory(code: string): string {
  // Simplified mapping based on subsidy codes
  if (code.startsWith('004')) return 'livestock_purchase';
  if (code.startsWith('001')) return 'milk';
  if (code.startsWith('002')) return 'breeding';
  return 'other';
}

/**
 * Run Pre-Check validation
 */
export function runPreCheck(input: PreCheckInput): PreCheckResult {
  const issues = checkEligibility(input);
  const { score, components, factors } = calculateImpactScore(input);
  
  // Estimate rank (simplified - would use real data distribution)
  const estimated_rank = estimateRank(score);
  
  const recommendations = generateRecommendations(input, components);
  
  return {
    eligible: issues.filter(i => i.severity === 'blocking').length === 0,
    issues,
    estimated_score: Math.round(score * 10) / 10,
    estimated_rank,
    recommendations
  };
}

function checkEligibility(input: PreCheckInput): PreCheckIssue[] {
  const issues: PreCheckIssue[] = [];
  
  // Check volume
  if (input.volume <= 0) {
    issues.push({
      code: 'INVALID_VOLUME',
      severity: 'blocking',
      message: 'Объём должен быть больше 0',
      fix: 'Укажите корректное количество голов/литров'
    });
  }
  
  // Check sum
  if (input.sum <= 0) {
    issues.push({
      code: 'INVALID_SUM',
      severity: 'blocking',
      message: 'Сумма субсидии должна быть больше 0',
      fix: 'Укажите корректную сумму'
    });
  }
  
  // Check sum per unit (rough validation)
  const sumPerUnit = input.sum / Math.max(input.volume, 1);
  if (sumPerUnit > 500000) {
    issues.push({
      code: 'HIGH_SUM_PER_UNIT',
      severity: 'warning',
      message: 'Сумма на единицу выше среднего',
      fix: 'Проверьте корректность суммы субсидии'
    });
  }
  
  // Check oblast
  if (!input.oblast || input.oblast.trim() === '') {
    issues.push({
      code: 'MISSING_OBLAST',
      severity: 'blocking',
      message: 'Не указана область',
      fix: 'Выберите область'
    });
  }
  
  // Check district
  if (!input.district || input.district.trim() === '') {
    issues.push({
      code: 'MISSING_DISTRICT',
      severity: 'blocking',
      message: 'Не указан район',
      fix: 'Выберите район'
    });
  }
  
  // Check subsidy code
  if (!input.subsidy_code || input.subsidy_code.trim() === '') {
    issues.push({
      code: 'MISSING_SUBSIDY_CODE',
      severity: 'blocking',
      message: 'Не указан вид субсидии',
      fix: 'Выберите вид субсидии'
    });
  }
  
  // Seasonal warning (example)
  if (input.month && (input.month < 2 || input.month > 5)) {
    issues.push({
      code: 'OFF_SEASON',
      severity: 'warning',
      message: 'Подача вне основного сезона',
      fix: 'Оптимальный период подачи: февраль-май'
    });
  }
  
  return issues;
}

function estimateRank(score: number): number {
  // Simplified rank estimation based on score distribution
  // In real implementation, would use actual data percentiles
  if (score >= 80) return Math.round(100 + (100 - score) * 10);
  if (score >= 70) return Math.round(200 + (80 - score) * 30);
  if (score >= 60) return Math.round(500 + (70 - score) * 50);
  if (score >= 50) return Math.round(1000 + (60 - score) * 100);
  return Math.round(2000 + (50 - score) * 50);
}

function generateRecommendations(input: PreCheckInput, components: ScoreComponents): Recommendation[] {
  const recommendations: Recommendation[] = [];
  
  // Timing recommendation
  if (!input.month || input.month < 2 || input.month > 5) {
    recommendations.push({
      action: 'Подайте в феврале-марте',
      score_increase: 5,
      difficulty: 'easy',
      description: 'Меньше конкуренция за бюджет в начале года'
    });
  }
  
  // Small farmer recommendation
  const isSmallFarmer = input.volume < SMALL_FARMER_VOLUME_THRESHOLD;
  if (!isSmallFarmer && input.volume < SMALL_FARMER_VOLUME_THRESHOLD * 2) {
    recommendations.push({
      action: 'Рассмотрите разделение заявки',
      score_increase: 7,
      difficulty: 'medium',
      description: 'Мелкие хозяйства получают приоритет'
    });
  }
  
  // Regional specialization
  if (components.regional_need < 70) {
    recommendations.push({
      action: 'Изучите региональные программы',
      score_increase: 3,
      difficulty: 'medium',
      description: 'Некоторые регионы имеют дополнительные программы поддержки'
    });
  }
  
  // Efficiency recommendation
  if (components.efficiency_potential < 60) {
    recommendations.push({
      action: 'Оптимизируйте объём заявки',
      score_increase: 8,
      difficulty: 'hard',
      description: 'Соотношение суммы к объёму влияет на эффективность'
    });
  }
  
  return recommendations.slice(0, 3);
}
