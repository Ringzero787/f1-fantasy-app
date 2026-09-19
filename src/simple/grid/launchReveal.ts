/**
 * Launch reveal (F-067) — pure sizing and timing.
 *
 * The icon is a lone U, so on a cold start the app shows that U (matching the
 * native splash) and unrolls the rest of the UNDERCUT wordmark out of it.
 * The two halves are pre-rendered PNGs (scripts/design/make-u-mark.py), so the
 * reveal does not depend on the fonts having loaded.
 */
export const WORDMARK_PX = { uWidth: 298, restWidth: 2193, height: 283 } as const;
/** U ink width as a fraction of the screen's short side — must match splash.png */
export const SPLASH_U_FRACTION = 0.30;
const WORDMARK_SCREEN_FRACTION = 0.78;
const WORDMARK_MAX_WIDTH = 520;

export interface WordmarkLayout {
  height: number;
  uWidth: number;
  restWidth: number;
  /** scale at which the U alone is as wide as it is on the native splash */
  startScale: number;
}

export function wordmarkLayout(screenWidth: number, screenHeight: number): WordmarkLayout {
  const shortSide = Math.max(1, Math.min(screenWidth, screenHeight));
  const total = Math.min(screenWidth * WORDMARK_SCREEN_FRACTION, WORDMARK_MAX_WIDTH);
  const k = total / (WORDMARK_PX.uWidth + WORDMARK_PX.restWidth);
  const uWidth = WORDMARK_PX.uWidth * k;
  return {
    height: WORDMARK_PX.height * k,
    uWidth,
    restWidth: WORDMARK_PX.restWidth * k,
    startScale: Math.max(1, (shortSide * SPLASH_U_FRACTION) / uWidth),
  };
}

/**
 * Scale of the wordmark row at reveal progress p (0..1): the U stays at splash
 * size until the unrolling letters need the room, then the row shrinks so its
 * visible width never passes 90% of the screen, landing on 1.
 */
export function revealScale(l: WordmarkLayout, p: number, screenWidth: number): number {
  if (p >= 1) return 1;
  const visible = l.uWidth + l.restWidth * Math.max(0, p);
  const room = (0.9 - 0.12 * p) * screenWidth;
  return Math.max(1, Math.min(l.startScale, room / visible));
}

/** Sampled curve for Animated.interpolate. */
export function revealScaleCurve(l: WordmarkLayout, screenWidth: number, steps = 20): { input: number[]; output: number[] } {
  const input = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  return { input, output: input.map((p) => revealScale(l, p, screenWidth)) };
}

export interface LaunchTimeline { hold: number; reveal: number; settle: number; fade: number }

/** Milliseconds per phase. Reduced motion skips the movement: wordmark, short hold, fade. */
export function launchTimeline(reduceMotion: boolean): LaunchTimeline {
  return reduceMotion
    ? { hold: 0, reveal: 0, settle: 700, fade: 250 }
    : { hold: 350, reveal: 650, settle: 550, fade: 300 };
}

export function launchTotalMs(t: LaunchTimeline): number {
  return t.hold + t.reveal + t.settle + t.fade;
}
