import { format, formatDistanceToNow, differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';

/**
 * Format a number as currency/points
 */
export function formatPoints(points: number): string {
  return points.toLocaleString('en-US');
}

/**
 * Format price as dollars
 */
export function formatDollars(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}

/**
 * Format price with trend indicator (in dollars)
 */
export function formatPrice(price: number, previousPrice?: number): string {
  const formatted = formatDollars(price);
  if (previousPrice === undefined) return formatted;

  const diff = price - previousPrice;
  if (diff > 0) return `${formatted} (+$${diff})`;
  if (diff < 0) return `${formatted} (-$${Math.abs(diff)})`;
  return formatted;
}

/**
 * Format a date in readable format
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy');
}

/**
 * Format a date with time
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy HH:mm');
}

/**
 * Format time only
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'HH:mm');
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Format countdown timer
 */
export function formatCountdown(milliseconds: number): string {
  if (milliseconds <= 0) return '00:00:00';

  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Format countdown in words
 */
export function formatCountdownWords(milliseconds: number): string {
  if (milliseconds <= 0) return 'Now';

  const totalSeconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);

  const parts: string[] = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}m`);

  return parts.join(' ') || 'Less than a minute';
}

/**
 * Format ordinal number (1st, 2nd, 3rd, etc.)
 */
export function formatOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Format position with P prefix
 */
export function formatPosition(position: number): string {
  return `P${position}`;
}

/**
 * Format percentage
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format price change percentage
 */
export function formatPriceChange(current: number, previous: number): string {
  if (previous === 0) return '0%';
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * Format budget display (in dollars)
 */
export function formatBudget(remaining: number, total: number): string {
  return `$${formatPoints(remaining)} / $${formatPoints(total)}`;
}

/**
 * Format race weekend schedule
 */
export function formatSessionTime(date: Date, timezone?: string): string {
  return format(date, 'EEE HH:mm');
}

/**
 * Format driver name (first initial + last name)
 */
export function formatDriverName(fullName: string): string {
  const parts = fullName.split(' ');
  if (parts.length < 2) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

/**
 * Format time with timezone awareness
 * When useLocalTime = false → format in track's IANA timezone with tz abbreviation
 * When useLocalTime = true → format in device timezone with tz abbreviation
 */
export function formatTimeWithZone(date: Date | string, trackTimezone: string, useLocalTime: boolean): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
    ...(useLocalTime ? {} : { timeZone: trackTimezone }),
  };
  return new Intl.DateTimeFormat('en-GB', options).format(d);
}

/**
 * Format date with timezone awareness
 * Day may differ across timezones so this respects the toggle too
 */
export function formatDateWithZone(date: Date | string, trackTimezone: string, useLocalTime: boolean): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(useLocalTime ? {} : { timeZone: trackTimezone }),
  };
  return new Intl.DateTimeFormat('en-US', options).format(d);
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Calculate sale value (no commission - players get full current market value)
 */
export function calculateSaleValue(currentPrice: number): number {
  return currentPrice; // Full current price, no commission
}

/**
 * Format sale value (in dollars)
 */
export function formatSaleValue(currentPrice: number): string {
  const saleValue = calculateSaleValue(currentPrice);
  return formatDollars(saleValue);
}

/**
 * Calculate profit/loss from a trade
 * Profit = current price - purchase price
 */
export function calculateProfitLoss(purchasePrice: number, currentPrice: number): number {
  return currentPrice - purchasePrice;
}

/**
 * Format profit/loss with color indicator (in dollars)
 */
export function formatProfitLoss(purchasePrice: number, currentPrice: number): {
  text: string;
  isProfit: boolean;
  isLoss: boolean;
  value: number;
} {
  const profitLoss = calculateProfitLoss(purchasePrice, currentPrice);
  const isProfit = profitLoss > 0;
  const isLoss = profitLoss < 0;

  let text: string;
  if (profitLoss > 0) {
    text = `+$${formatPoints(profitLoss)}`;
  } else if (profitLoss < 0) {
    text = `-$${formatPoints(Math.abs(profitLoss))}`;
  } else {
    text = '$0';
  }

  return { text, isProfit, isLoss, value: profitLoss };
}
