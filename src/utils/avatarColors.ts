// Avatar color generation utilities
// Generates consistent colors based on a string (name)

// Predefined color palette for avatars - vibrant but harmonious colors
const AVATAR_COLORS = [
  { bg: '#6D28D9', text: '#FFFFFF' }, // Purple
  { bg: '#059669', text: '#FFFFFF' }, // Green
  { bg: '#DC2626', text: '#FFFFFF' }, // Red
  { bg: '#2563EB', text: '#FFFFFF' }, // Blue
  { bg: '#D97706', text: '#FFFFFF' }, // Amber
  { bg: '#7C3AED', text: '#FFFFFF' }, // Violet
  { bg: '#0891B2', text: '#FFFFFF' }, // Cyan
  { bg: '#BE185D', text: '#FFFFFF' }, // Pink
  { bg: '#4F46E5', text: '#FFFFFF' }, // Indigo
  { bg: '#0D9488', text: '#FFFFFF' }, // Teal
  { bg: '#EA580C', text: '#FFFFFF' }, // Orange
  { bg: '#7C2D12', text: '#FFFFFF' }, // Brown
];

// Gradient pairs for more dynamic avatars
export const AVATAR_GRADIENTS: readonly [string, string][] = [
  ['#6D28D9', '#A855F7'], // Purple gradient
  ['#059669', '#10B981'], // Green gradient
  ['#DC2626', '#F87171'], // Red gradient
  ['#2563EB', '#60A5FA'], // Blue gradient
  ['#D97706', '#FBBF24'], // Amber gradient
  ['#7C3AED', '#A78BFA'], // Violet gradient
  ['#0891B2', '#22D3EE'], // Cyan gradient
  ['#BE185D', '#F472B6'], // Pink gradient
  ['#4F46E5', '#818CF8'], // Indigo gradient
  ['#0D9488', '#2DD4BF'], // Teal gradient
  ['#EA580C', '#FB923C'], // Orange gradient
  ['#7C2D12', '#A16207'], // Brown gradient
];

/**
 * Generate a simple hash from a string
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get consistent colors for a given name
 */
export function getAvatarColors(name: string): { bg: string; text: string } {
  const hash = hashString(name.toLowerCase());
  const index = hash % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

/**
 * Get consistent gradient colors for a given name
 */
export function getAvatarGradient(name: string): readonly [string, string] {
  const hash = hashString(name.toLowerCase());
  const index = hash % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

/**
 * Extract initials from a name (max 2 characters)
 */
export function getInitials(name: string): string {
  if (!name || name.trim().length === 0) return '?';

  const words = name.trim().split(/\s+/);

  if (words.length === 1) {
    // Single word: take first 2 characters
    return words[0].substring(0, 2).toUpperCase();
  }

  // Multiple words: take first letter of first 2 words
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Generate a pattern seed for potential future SVG patterns
 */
export function getPatternSeed(name: string): number {
  return hashString(name.toLowerCase()) % 1000;
}
