/**
 * One headline on the wire (F-071): who it is about, the link to its source, and the reader's
 * two controls — mark it read so it leaves the Briefing, and a thumb either way so the page
 * learns what this reader wants more or less of.
 *
 * The controls are buttons with names, not icons alone, and stop the click from also opening
 * the driver panel, which the rest of the row does.
 */
import { entity } from '../data/logic';
import type { NewsItem } from '../data/types';
import { newsKey } from '../data/wire';
import { useStore } from '../state';
import { Pill, Row, TeamBar } from './bits';

const when = (iso: string) => (iso ? `${new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : '');

export function NewsRow({ n, full = false }: { n: NewsItem; full?: boolean }) {
  const { payload: p, wire, markRead, rateNews, open } = useStore();
  const key = newsKey(n);
  const e = n.entity ? entity(p, n.entity) : undefined;
  const rating = wire.liked[key];
  const read = !!wire.read[key];
  const stop = (fn: () => void) => (ev: React.MouseEvent) => { ev.stopPropagation(); fn(); };
  return (
    // The kind has its own column on a wide screen and sits inline on a phone, where a fixed
    // column would leave the headline a third of the width and four lines tall.
    <div className="newsrow">
    <Row cols="96px 1fr auto" dense={!full} onClick={e ? () => open(e.id) : undefined} label={`${n.kind}: ${n.text}`}>
      <span className="only-wide"><Pill red={n.tone === '-'}>{n.kind}</Pill></span>
      <span style={{ opacity: read ? 0.55 : 1 }}>
        <span className="only-narrow"><Pill red={n.tone === '-'}>{n.kind}</Pill> </span>
        {e ? <TeamBar p={p} team={e.team} /> : null}{n.text}
        {full && n.detail ? <><br /><span className="mut">{n.detail}</span></> : null}
        <br />
        <span className="mut">
          {n.publishedAt ? `${when(n.publishedAt)} · ` : ''}
          {n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" onClick={(ev) => ev.stopPropagation()} style={{ color: 'inherit' }}>{n.sources} ↗</a> : n.sources}
        </span>
      </span>
      <span className="srow nctl">
        <button type="button" className={`chip ${rating === 1 ? 'on' : ''}`} aria-pressed={rating === 1} aria-label={`More like this: ${n.text}`} title="More like this" onClick={stop(() => rateNews(key, 1))}>▲</button>
        <button type="button" className={`chip ${rating === -1 ? 'on' : ''}`} aria-pressed={rating === -1} aria-label={`Less like this: ${n.text}`} title="Less like this" onClick={stop(() => rateNews(key, -1))}>▼</button>
        {read ? <span className="mut" style={{ fontSize: 10, padding: '0 4px' }}>read</span>
          : <button type="button" className="chip" aria-label={`Mark read: ${n.text}`} title="Mark read" onClick={stop(() => markRead(key))}>✓</button>}
      </span>
    </Row>
    </div>
  );
}
