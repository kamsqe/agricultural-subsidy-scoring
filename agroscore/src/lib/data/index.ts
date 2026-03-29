/**
 * Data Layer Abstraction
 * 
 * This module provides a clean interface for data access.
 * Currently uses static JSON imports, but designed for easy migration to API calls.
 * 
 * To migrate to API:
 * 1. Replace static imports with fetch calls
 * 2. Update the implementation, not the interface
 */

import type { 
  Application, 
  Aggregates, 
  Filters, 
  SimulationParams, 
  SimulationResult,
  MapData 
} from '../types';

// Mock data for development - will be replaced with real JSON imports
const MOCK_APPLICATIONS: Application[] = [];
const MOCK_AGGREGATES: Aggregates = {
  oblasts: [],
  districts: [],
  subsidy_types: [],
  monthly: [],
  summary: {
    total_applications: 36651,
    total_cases: 23851,
    total_approved: 33742,
    total_rejected: 2909,
    application_reject_rate: 0.092,
    case_reject_rate: 0.037,
    total_budget: 66_000_000_000,
    avg_subsidy: 1_800_000,
    small_farmer_count: 8500,
    retry_rate: 0.65
  }
};

/**
 * Get applications with optional filtering
 * 
 * MVP: Returns from static JSON
 * Future: Can be swapped to /api/applications endpoint
 */
export async function getApplications(filters?: Filters): Promise<Application[]> {
  // TODO: Replace with real data import when ML pipeline is ready
  // import applicationsData from './applications.json';
  
  let apps = MOCK_APPLICATIONS;
  
  if (filters) {
    apps = applyFilters(apps, filters);
  }
  
  return apps;
}

/**
 * Get top N applications by score
 */
export async function getTopApplications(limit: number = 500): Promise<Application[]> {
  const apps = await getApplications();
  return apps
    .sort((a, b) => b.impact_score - a.impact_score)
    .slice(0, limit);
}

/**
 * Get aggregated statistics
 */
export async function getAggregates(): Promise<Aggregates> {
  // TODO: Replace with real data import
  // import aggregatesData from './aggregates.json';
  return MOCK_AGGREGATES;
}

/**
 * Run budget simulation
 * 
 * MVP: Client-side calculation using pre-loaded data
 * Future: Can be moved to /api/simulate endpoint
 */
export async function runSimulation(params: SimulationParams): Promise<SimulationResult> {
  const apps = await getApplications();
  return simulateAllocation(apps, params);
}

/**
 * Get pre-computed simulations for comparison
 */
export async function getPrecomputedSimulations(): Promise<Record<string, SimulationResult[]>> {
  // TODO: Replace with real data import
  // import simulationsData from './simulations.json';
  return {
    fifo: [],
    merit: [],
    uplift: []
  };
}

/**
 * Get map data (oblast boundaries)
 */
export async function getMapData(): Promise<MapData> {
  // TODO: Replace with real SVG data import
  return {
    oblasts: []
  };
}

/**
 * Get single application by ID
 */
export async function getApplicationById(id: string): Promise<Application | null> {
  const apps = await getApplications();
  return apps.find(app => app.id === id) || null;
}

// Helper functions

function applyFilters(apps: Application[], filters: Filters): Application[] {
  return apps.filter(app => {
    if (filters.oblasts?.length && !filters.oblasts.includes(app.oblast)) {
      return false;
    }
    if (filters.subsidy_codes?.length && !filters.subsidy_codes.includes(app.subsidy_code)) {
      return false;
    }
    if (filters.score_min !== undefined && app.impact_score < filters.score_min) {
      return false;
    }
    if (filters.score_max !== undefined && app.impact_score > filters.score_max) {
      return false;
    }
    if (filters.sum_min !== undefined && app.sum < filters.sum_min) {
      return false;
    }
    if (filters.sum_max !== undefined && app.sum > filters.sum_max) {
      return false;
    }
    if (filters.status?.length && !filters.status.includes(app.status)) {
      return false;
    }
    if (filters.is_small_farmer !== undefined && app.is_small_farmer !== filters.is_small_farmer) {
      return false;
    }
    return true;
  });
}

function simulateAllocation(apps: Application[], params: SimulationParams): SimulationResult {
  // Sort applications based on strategy
  let sorted: Application[];
  
  switch (params.strategy) {
    case 'fifo':
      sorted = [...apps].sort((a, b) => 
        new Date(a.submission_date).getTime() - new Date(b.submission_date).getTime()
      );
      break;
    case 'merit':
    case 'uplift':
      sorted = [...apps].sort((a, b) => b.impact_score - a.impact_score);
      break;
    default:
      sorted = apps;
  }
  
  // Allocate budget
  let remaining = params.budget;
  const funded: Application[] = [];
  const recipientTotals: Record<string, number> = {};
  const districtTotals: Record<string, number> = {};
  
  for (const app of sorted) {
    if (remaining < app.sum) continue;
    
    // Check constraints
    if (params.constraints) {
      const recipientTotal = (recipientTotals[app.producer_id] || 0) + app.sum;
      const maxRecipient = params.budget * params.constraints.max_single_recipient;
      if (recipientTotal > maxRecipient) continue;
      
      const districtTotal = (districtTotals[app.district] || 0) + app.sum;
      const maxDistrict = params.budget * params.constraints.max_district;
      if (districtTotal > maxDistrict) continue;
    }
    
    funded.push(app);
    remaining -= app.sum;
    recipientTotals[app.producer_id] = (recipientTotals[app.producer_id] || 0) + app.sum;
    districtTotals[app.district] = (districtTotals[app.district] || 0) + app.sum;
  }
  
  // Calculate metrics
  const totalAllocated = params.budget - remaining;
  const smallFarmerCount = funded.filter(a => a.is_small_farmer).length;
  
  // Distribution by oblast
  const byOblast: Record<string, number> = {};
  const bySubsidyType: Record<string, number> = {};
  
  for (const app of funded) {
    byOblast[app.oblast] = (byOblast[app.oblast] || 0) + app.sum;
    bySubsidyType[app.subsidy_code] = (bySubsidyType[app.subsidy_code] || 0) + app.sum;
  }
  
  // Calculate Gini coefficient (simplified)
  const amounts = funded.map(a => a.sum).sort((a, b) => a - b);
  const gini = calculateGini(amounts);
  
  // Regional coefficient of variation
  const oblastAmounts = Object.values(byOblast);
  const regionalCV = calculateCV(oblastAmounts);
  
  // Count monopoly districts (>50% to single recipient)
  let monopolyDistricts = 0;
  for (const district of Object.keys(districtTotals)) {
    const districtApps = funded.filter(a => a.district === district);
    const maxShare = Math.max(...districtApps.map(a => 
      recipientTotals[a.producer_id] / districtTotals[district]
    ));
    if (maxShare > 0.5) monopolyDistricts++;
  }
  
  return {
    strategy: params.strategy,
    budget: params.budget,
    funded_count: funded.length,
    total_allocated: totalAllocated,
    metrics: {
      gini,
      regional_cv: regionalCV,
      small_farmer_share: funded.length > 0 ? smallFarmerCount / funded.length : 0,
      monopoly_districts: monopolyDistricts,
      avg_score: funded.length > 0 
        ? funded.reduce((sum, a) => sum + a.impact_score, 0) / funded.length 
        : 0
    },
    distribution: {
      by_oblast: byOblast,
      by_subsidy_type: bySubsidyType
    }
  };
}

function calculateGini(values: number[]): number {
  if (values.length === 0) return 0;
  
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * values[i];
  }
  
  return numerator / (n * sum);
}

function calculateCV(values: number[]): number {
  if (values.length === 0) return 0;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return stdDev / mean;
}
