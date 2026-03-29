// Core data types for AgroScore

export interface Application {
  id: string;
  app_num: string;
  producer_id: string; // derived from app_num[:11]
  
  // Location
  oblast: string;
  district: string;
  
  // Subsidy info
  subsidy_code: string;
  subsidy_name: string;
  subsidy_category: 'livestock_purchase' | 'milk' | 'breeding' | 'other';
  
  // Financials
  volume: number;
  sum: number;
  
  // Timing
  submission_date: string;
  month: number;
  year: number;
  
  // Status
  status: 'approved' | 'rejected' | 'pending';
  
  // Computed scores
  impact_score: number;
  rank: number;
  
  // Score components (0-100 each)
  score_components: ScoreComponents;
  
  // Top factors affecting score
  top_factors: Factor[];
  
  // Flags
  is_small_farmer: boolean;
  fraud_risk: number;
  retry_count: number;
}

export interface ScoreComponents {
  strategic_alignment: number;
  fairness_factor: number;
  regional_need: number;
  efficiency_potential: number;
  mission_alignment: number;
  fraud_penalty: number;
}

export interface Factor {
  name: string;
  contribution: number;
  direction: 'positive' | 'negative';
  description: string;
}

export interface Aggregates {
  oblasts: OblastAggregate[];
  districts: DistrictAggregate[];
  subsidy_types: SubsidyTypeAggregate[];
  monthly: MonthlyAggregate[];
  summary: SummaryStats;
}

export interface OblastAggregate {
  name: string;
  total_applications: number;
  total_approved: number;
  total_rejected: number;
  reject_rate: number;
  total_sum: number;
  avg_score: number;
  small_farmer_share: number;
  monopoly_index: number;
}

export interface DistrictAggregate {
  name: string;
  oblast: string;
  total_applications: number;
  reject_rate: number;
  total_sum: number;
  avg_score: number;
  top_recipient_share: number;
}

export interface SubsidyTypeAggregate {
  code: string;
  name: string;
  category: string;
  total_applications: number;
  total_approved: number;
  reject_rate: number;
  total_sum: number;
  avg_volume: number;
}

export interface MonthlyAggregate {
  month: number;
  year: number;
  total_applications: number;
  total_approved: number;
  budget_pressure: number;
}

export interface SummaryStats {
  total_applications: number;
  total_cases: number;
  total_approved: number;
  total_rejected: number;
  application_reject_rate: number;
  case_reject_rate: number;
  total_budget: number;
  avg_subsidy: number;
  small_farmer_count: number;
  retry_rate: number;
}

// Simulation types
export interface SimulationParams {
  budget: number;
  strategy: 'fifo' | 'merit' | 'uplift';
  weights?: {
    strategic: number;
    fairness: number;
    need: number;
    efficiency: number;
  };
  constraints?: {
    max_single_recipient: number;
    max_district: number;
    min_small_farmer: number;
  };
}

export interface SimulationResult {
  strategy: string;
  budget: number;
  funded_count: number;
  total_allocated: number;
  metrics: SimulationMetrics;
  distribution: {
    by_oblast: Record<string, number>;
    by_subsidy_type: Record<string, number>;
  };
}

export interface SimulationMetrics {
  gini: number;
  regional_cv: number;
  small_farmer_share: number;
  monopoly_districts: number;
  avg_score: number;
}

// Pre-check types
export interface PreCheckInput {
  oblast: string;
  district: string;
  subsidy_code: string;
  volume: number;
  sum: number;
  month?: number;
}

export interface PreCheckResult {
  eligible: boolean;
  issues: PreCheckIssue[];
  estimated_score: number;
  estimated_rank: number;
  recommendations: Recommendation[];
}

export interface PreCheckIssue {
  code: string;
  severity: 'blocking' | 'warning';
  message: string;
  fix: string;
}

export interface Recommendation {
  action: string;
  score_increase: number;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
}

// Filter types
export interface Filters {
  oblasts?: string[];
  subsidy_codes?: string[];
  score_min?: number;
  score_max?: number;
  sum_min?: number;
  sum_max?: number;
  status?: ('approved' | 'rejected' | 'pending')[];
  is_small_farmer?: boolean;
}

// Map data types
export interface MapData {
  oblasts: MapRegion[];
}

export interface MapRegion {
  id: string;
  name: string;
  path: string; // SVG path d attribute
  center: [number, number];
}
