// Largest font size, up to `target`, at which a one-line run of text fits `available` width.
// `emWidth` is the run's width in ems at that face and tracking, measured once off a
// screenshot. For text that must stay on one line where adjustsFontSizeToFit is the wrong
// tool: it leaves letterSpacing at the unshrunk value, so tight negative tracking overlaps.
export function fitFontSize(target: number, available: number, emWidth: number): number {
  if (!(available > 0) || !(emWidth > 0)) return target;
  return Math.max(1, Math.min(target, Math.floor(available / emWidth)));
}

// "UNDERCUT" in Archivo Black at -0.05em tracking measures 7.11em on the iOS simulator (320pt wide
// at 45pt). The constant is that plus about 5%, for a platform that sets the face a little wider:
// too generous costs a point of size, too tight costs the end of the name.
export const WORDMARK_MEASURED_EM = 7.11;
export const WORDMARK_EM_WIDTH = 7.5;
