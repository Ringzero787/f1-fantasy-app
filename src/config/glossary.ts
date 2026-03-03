/**
 * Glossary of F1 fantasy jargon terms.
 * Used by TooltipText to show definitions on tap.
 */
export const GLOSSARY: Record<string, string> = {
  f1Constructor:
    'The team that builds the car. Each F1 team (e.g. Red Bull, Ferrari) is called a constructor.',
  ace:
    'Your star pick — earns 2× base points each race. Must cost $200 or less. One ace per team (driver or constructor).',
  bank:
    'Remaining budget you can spend on new drivers or constructors. You start with $1,000.',
  value:
    'Total market value of all drivers and constructors currently on your team.',
  contractLength:
    'How many races a driver or constructor stays on your team before the contract expires and they leave.',
  teamsLocked:
    'During a race weekend, team changes are frozen. You cannot add, remove, or swap drivers until the session ends.',
  ppr:
    'Points Per Race — average fantasy points scored per race. Useful for comparing consistency.',
  tier:
    'Driver price tier. A-tier (>$240) are elite, B-tier ($121–$240) are mid-range, C-tier (≤$120) are budget picks.',
  fp:
    'Fantasy Points — points earned in this game based on real F1 race results plus position bonuses.',
  last:
    'Final race of this contract. After this race the driver/constructor leaves your team automatically.',
  loyalty:
    'Loyalty bonus — extra points earned per race for keeping a driver beyond the minimum contract. Shown as +N/r.',
  autoFill:
    'Automatically fills empty team slots with the best available drivers that fit your remaining budget.',
  earlyTermFee:
    'A penalty for selling a driver or constructor before their contract ends. Equals 10% of their purchase price.',
  profitLoss:
    'Profit/Loss — the difference between what you paid for a driver and what you receive when selling them.',
};
