import { entity } from '../data/logic';
import { useStore } from '../state';
import { Chip, Empty, Pill, Row, Tile } from '../ui/bits';
import { NOT_PUBLISHED } from '../data/coverage';

export function Wire() {
  const { payload: p, has, ui, set, open } = useStore();
  const cats = ['ALL', ...new Set(p.news.map((n) => n.kind))];
  const list = p.news.filter((n) => ui.wire === 'ALL' || n.kind === ui.wire);
  return (
    <div className="page">
      <Tile span="c12" label="The wire · story clusters" right={<div className="th">{cats.map((c) => <Chip key={c} on={ui.wire === c} onClick={() => set('wire', c)}>{c}</Chip>)}</div>}>
        {!has.news ? <Empty>{NOT_PUBLISHED.news} The wire gathers and clusters stories once the news pipeline is running.</Empty> : null}
        {list.map((n) => { const e = n.entity ? entity(p, n.entity) : undefined; return (
          <Row key={n.text} cols="100px 1fr auto" onClick={e ? () => open(e.id) : undefined} label={`${n.kind}: ${n.text}`}>
            <Pill red={n.tone === '-'}>{n.kind}</Pill>
            <span>{n.text}<br /><span className="mut">{n.detail} · our two-line summary, full story at the source ↗</span></span>
            <span className="mut only-wide">{e ? e.name : 'Field'}</span>
          </Row>
        ); })}
      </Tile>
    </div>
  );
}
