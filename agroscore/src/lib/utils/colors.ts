/**
 * Color utilities for visualizations
 */

import * as d3 from 'd3';

// Brand colors
export const COLORS = {
  primary: '#2563eb',      // blue-600
  secondary: '#7c3aed',    // violet-600
  success: '#16a34a',      // green-600
  warning: '#ea580c',      // orange-600
  danger: '#dc2626',       // red-600
  info: '#0891b2',         // cyan-600
  
  // Score colors
  scoreHigh: '#16a34a',    // green
  scoreMid: '#eab308',     // yellow
  scoreLow: '#dc2626',     // red
  
  // Status colors
  approved: '#16a34a',
  rejected: '#dc2626',
  pending: '#6b7280',
  
  // Background
  bgLight: '#f8fafc',
  bgDark: '#1e293b'
};

/**
 * Get color for impact score (0-100)
 */
export function getScoreColor(score: number): string {
  if (score >= 70) return COLORS.scoreHigh;
  if (score >= 50) return COLORS.scoreMid;
  return COLORS.scoreLow;
}

/**
 * Get color for status
 */
export function getStatusColor(status: 'approved' | 'rejected' | 'pending'): string {
  return COLORS[status];
}

/**
 * Create color scale for choropleth maps
 */
export function createChoroplethScale(
  domain: [number, number],
  scheme: 'blues' | 'reds' | 'greens' | 'oranges' = 'blues'
): d3.ScaleSequential<string> {
  const interpolators = {
    blues: d3.interpolateBlues,
    reds: d3.interpolateReds,
    greens: d3.interpolateGreens,
    oranges: d3.interpolateOranges
  };
  
  return d3.scaleSequential(interpolators[scheme])
    .domain(domain);
}

/**
 * Create diverging color scale (for comparisons)
 */
export function createDivergingScale(
  domain: [number, number, number]
): d3.ScaleDiverging<string> {
  return d3.scaleDiverging(d3.interpolateRdYlGn)
    .domain(domain);
}

/**
 * Get color for delta values
 */
export function getDeltaColor(value: number): string {
  if (value > 0) return COLORS.success;
  if (value < 0) return COLORS.danger;
  return '#6b7280';
}

/**
 * Category colors for charts
 */
export const CATEGORY_COLORS = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#16a34a', // green
  '#ea580c', // orange
  '#ec4899', // pink
  '#0891b2', // cyan
  '#8b5cf6', // purple
  '#f59e0b', // amber
];

/**
 * Get category color by index
 */
export function getCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

/**
 * Oblast colors (consistent mapping)
 */
export const OBLAST_COLORS: Record<string, string> = {
  'Алматинская область': '#2563eb',
  'Туркестанская область': '#7c3aed',
  'Жамбылская область': '#16a34a',
  'Кызылординская область': '#ea580c',
  'Восточно-Казахстанская область': '#ec4899',
  'Северо-Казахстанская область': '#0891b2',
  'Акмолинская область': '#8b5cf6',
  'Костанайская область': '#f59e0b',
  'Павлодарская область': '#10b981',
  'Карагандинская область': '#6366f1',
  'Западно-Казахстанская область': '#f43f5e',
  'Актюбинская область': '#14b8a6',
  'Атырауская область': '#a855f7',
  'Мангистауская область': '#f97316',
  'Улытауская область': '#06b6d4',
  'Абай область': '#84cc16',
  'Жетісу область': '#e11d48'
};

export function getOblastColor(oblast: string): string {
  return OBLAST_COLORS[oblast] || '#6b7280';
}
