/**
 * Formatting utilities for display
 */

/**
 * Format number as currency (Tenge)
 */
export function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)} млрд ₸`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} млн ₸`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)} тыс ₸`;
  }
  return `${value.toFixed(0)} ₸`;
}

/**
 * Format number with thousands separator
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value));
}

/**
 * Format percentage
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format score (0-100)
 */
export function formatScore(value: number): string {
  return value.toFixed(1);
}

/**
 * Format rank
 */
export function formatRank(rank: number, total?: number): string {
  if (total) {
    return `#${formatNumber(rank)} из ${formatNumber(total)}`;
  }
  return `#${formatNumber(rank)}`;
}

/**
 * Format date
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format month name
 */
export function formatMonth(month: number): string {
  const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];
  return months[month - 1] || '';
}

/**
 * Format volume (heads/liters)
 */
export function formatVolume(value: number, unit: string = 'голов'): string {
  return `${formatNumber(value)} ${unit}`;
}

/**
 * Format delta with sign and color class
 */
export function formatDelta(value: number, isPercent: boolean = false): {
  text: string;
  colorClass: string;
  isPositive: boolean;
} {
  const isPositive = value > 0;
  const sign = isPositive ? '+' : '';
  const text = isPercent 
    ? `${sign}${(value * 100).toFixed(1)}%`
    : `${sign}${formatNumber(value)}`;
  
  return {
    text,
    colorClass: isPositive ? 'text-green-600' : value < 0 ? 'text-red-600' : 'text-gray-600',
    isPositive
  };
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Get oblast short name
 */
export function getOblastShort(name: string): string {
  return name
    .replace(' область', '')
    .replace('Восточно-Казахстанская', 'ВКО')
    .replace('Западно-Казахстанская', 'ЗКО')
    .replace('Северо-Казахстанская', 'СКО');
}
