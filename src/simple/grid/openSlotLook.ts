/**
 * F-167: how an open Team-grid slot looks. A slot the player can fill gets a soft accent wash, a
 * dashed accent border and a ringed "+", so it never reads like a filled tile. A locked or
 * read-only slot stays quiet: there is nothing to do with it. The labels stay in the main text
 * colour: small red text on the light wash is only about 3:1, under AA's 4.5:1.
 */
export interface OpenSlotColors {
  primary: string;
  primaryFaint: string;
  borderStrong: string;
  text: { primary: string; muted: string };
}

export interface OpenSlotLook {
  open: boolean;
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
  /** the "+" (and its ring when open) */
  accent: string;
  label: string;
  ring: boolean;
}

export function openSlotLook(c: OpenSlotColors, disabled: boolean): OpenSlotLook {
  if (disabled) {
    return { open: false, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: 'transparent', accent: c.text.muted, label: c.text.muted, ring: false };
  }
  return { open: true, borderWidth: 1.5, borderColor: c.primary, backgroundColor: c.primaryFaint, accent: c.primary, label: c.text.primary, ring: true };
}
