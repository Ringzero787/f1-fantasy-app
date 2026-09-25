/**
 * The forecast grid around the circuit, drawn as a map (F-070).
 *
 * A 5-by-5 grid of point forecasts at 40 km spacing, so ±80 km around the track. Each cell is
 * shaded by the rain expected in that hour, the circuit sits in the centre, distance rings mark
 * 40 and 80 km, and an arrow shows where the wind is coming from. Frames three hours either side
 * of the session let a band of rain be seen moving, which is the point: whether weather is
 * looming, not just what is over the track now.
 *
 * Everything here comes from the payload; nothing is fetched by the page.
 */
import { useState } from 'react';
import type { WeatherMap as WeatherMapData, MapFrame } from '../data/types';
import { AsTable, Tabs } from './bits';

const SIZE = 300;

/** Cell shade for a rain amount: nothing for dry, then deeper blues; unknown is hatched grey. */
function fill(mm: number | null): string {
  if (mm === null) return 'url(#pw-unknown)';
  if (mm <= 0) return 'transparent';
  if (mm < 0.5) return 'rgba(70,130,255,.25)';
  if (mm < 1.5) return 'rgba(70,130,255,.5)';
  if (mm < 4) return 'rgba(50,100,230,.75)';
  return 'rgba(30,60,200,.95)';
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg: number) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/**
 * One sentence about what is coming: the wettest cell upwind of the circuit, and how far. Wind
 * "from" 315° means weather arrives from the north-west, so the cells to look at are the ones in
 * that direction.
 */
export function looming(frame: MapFrame, side: number, spacingKm: number): string | null {
  const r = Math.floor(side / 2);
  const centre = frame.rainMm[r * side + r];
  if (centre !== null && centre >= 0.5) return `Rain over the circuit itself: ${centre} mm in the hour.`;
  if (frame.windFromDeg === null) return null;
  const rad = ((frame.windFromDeg - 90) * Math.PI) / 180;
  // unit vector pointing upwind on the grid (x east, y south in screen terms)
  const ux = Math.cos(rad), uy = Math.sin(rad);
  let best: { mm: number; km: number } | null = null;
  frame.rainMm.forEach((mm, i) => {
    if (mm === null || mm < 0.5) return;
    const dx = (i % side) - r, dy = Math.floor(i / side) - r;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    // only cells roughly upwind count as "coming this way"
    const along = (dx * ux + dy * uy) / dist;
    if (along < 0.5) return;
    const km = Math.round(dist * spacingKm);
    if (!best || mm > best.mm) best = { mm, km };
  });
  if (!best) return null;
  const b: { mm: number; km: number } = best;
  const hours = frame.windKph && frame.windKph > 0 ? Math.round(b.km / frame.windKph) : null;
  return `Rain ${b.km} km to the ${compass(frame.windFromDeg)}, upwind${hours !== null ? `, about ${hours}h away at this wind` : ''}: ${b.mm} mm in the hour.`;
}

export function WeatherMap({ map }: { map: WeatherMapData }) {
  const [sessionKey, setSessionKey] = useState(map.sessions[0]?.key ?? '');
  const session = map.sessions.find((s) => s.key === sessionKey) ?? map.sessions[0];
  const [offset, setOffset] = useState<number>(0);
  const frame = session.frames.find((f) => f.offsetH === offset) ?? session.frames[0];
  const side = 2 * map.radius + 1;
  const cell = SIZE / side;
  const centre = SIZE / 2;
  const offsets = session.frames.map((f) => (f.offsetH === 0 ? session.label : `${f.offsetH > 0 ? '+' : ''}${f.offsetH}h`));
  const note = looming(frame, side, map.spacingKm);
  const when = new Date(frame.at).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

  return (
    <div>
      <div className="th" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        {map.sessions.length > 1 ? <Tabs value={session.key} options={map.sessions.map((s) => s.key)} onChange={setSessionKey} label="Session" /> : null}
        <Tabs value={offsets[session.frames.indexOf(frame)] ?? offsets[0]} options={offsets} onChange={(v) => setOffset(session.frames[offsets.indexOf(v)]?.offsetH ?? 0)} label="Hours around the session" />
      </div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="wmap" role="img" aria-label={`Rain around the circuit, ${when} UTC`}>
        <defs>
          <pattern id="pw-unknown" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="var(--borderS)" strokeWidth="1" /></pattern>
        </defs>
        {frame.rainMm.map((mm, i) => (
          <rect key={i} x={(i % side) * cell} y={Math.floor(i / side) * cell} width={cell} height={cell} fill={fill(mm)} stroke="var(--borderL)" strokeWidth="0.5">
            <title>{`${Math.round(Math.hypot((i % side) - map.radius, Math.floor(i / side) - map.radius) * map.spacingKm)} km: ${mm === null ? 'no forecast' : `${mm} mm`}`}</title>
          </rect>
        ))}
        {[1, 2].map((ring) => <circle key={ring} cx={centre} cy={centre} r={ring * cell} fill="none" stroke="var(--fg2)" strokeOpacity="0.35" strokeDasharray="3 3" />)}
        <text x={centre + cell + 3} y={centre - 3} style={{ fill: 'var(--fg2)', fontSize: 9, fontFamily: 'var(--mono)' }}>{map.spacingKm} km</text>
        <text x={centre + 2 * cell + 3} y={centre - 3} style={{ fill: 'var(--fg2)', fontSize: 9, fontFamily: 'var(--mono)' }}>{2 * map.spacingKm}</text>
        {(['N', 'E', 'S', 'W'] as const).map((d) => {
          const pos = { N: [centre, 11], E: [SIZE - 8, centre + 4], S: [centre, SIZE - 5], W: [8, centre + 4] }[d];
          return <text key={d} x={pos[0]} y={pos[1]} textAnchor="middle" style={{ fill: 'var(--fg)', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700 }}>{d}</text>;
        })}
        <circle cx={centre} cy={centre} r="5" fill="var(--red)" stroke="var(--card)" strokeWidth="2"><title>The circuit</title></circle>
        {frame.windFromDeg !== null ? (
          <g transform={`translate(${SIZE - 34} 34) rotate(${frame.windFromDeg})`}>
            <title>{`Wind from the ${compass(frame.windFromDeg)}${frame.windKph !== null ? `, ${frame.windKph} kph` : ''}`}</title>
            <circle r="16" fill="var(--card)" stroke="var(--borderS)" />
            {/* the arrow points the way the wind blows: from the "from" direction, through the centre */}
            <line x1="0" y1="-10" x2="0" y2="9" stroke="var(--fg)" strokeWidth="2" />
            <polygon points="-4,6 4,6 0,12" fill="var(--fg)" />
          </g>
        ) : null}
      </svg>
      <div className="mut" style={{ marginTop: 8 }}>
        {when} UTC · wind {frame.windFromDeg === null ? '—' : `from the ${compass(frame.windFromDeg)}`}{frame.windKph !== null ? ` at ${frame.windKph} kph` : ''}.
        {note ? ` ${note}` : ' Nothing upwind within range.'}
      </div>
      <AsTable caption={`Rain by cell, ${when} UTC, ${map.spacingKm} km apart`} head={['Row', ...Array.from({ length: side }, (_, i) => `${(i - map.radius) * map.spacingKm} km E`)]}
        rows={Array.from({ length: side }, (_, row) => [`${(map.radius - row) * map.spacingKm} km N`, ...frame.rainMm.slice(row * side, (row + 1) * side).map((mm) => (mm === null ? '—' : `${mm}`))])} />
    </div>
  );
}
