import { newsKey, rank } from '../data/wire';
import { NewsRow } from '../ui/NewsRow';
import { useState } from 'react';
import { useStore } from '../state';
import { Chip, Empty, Tile } from '../ui/bits';
import { NOT_PUBLISHED } from '../data/coverage';

export function Wire() {
  const { payload: p, has, wire, ui, set } = useStore();
  const [showRead, setShowRead] = useState(false);
  const cats = ['ALL', ...new Set(p.news.map((n) => n.kind))];
  const ranked = rank(p.news, wire).filter((n) => ui.wire === 'ALL' || n.kind === ui.wire);
  const list = showRead ? ranked : ranked.filter((n) => !wire.read[newsKey(n)]);
  const readCount = ranked.length - ranked.filter((n) => !wire.read[newsKey(n)]).length;
  return (
    <div className="page">
      <Tile span="c12" label="The wire · from the official feeds" right={<div className="th">{cats.map((c) => <Chip key={c} on={ui.wire === c} onClick={() => set('wire', c)}>{c}</Chip>)}{readCount ? <Chip on={showRead} onClick={() => setShowRead((v) => !v)}>{showRead ? 'HIDE READ' : `READ · ${readCount}`}</Chip> : null}</div>}>
        {!has.news ? <Empty>{NOT_PUBLISHED.news}</Empty> : null}
        {list.length === 0 && has.news ? <Empty>{showRead ? 'Nothing here.' : 'You are caught up.'}</Empty> : null}
        <div className="list">{list.map((n) => <NewsRow key={newsKey(n)} n={n} full />)}</div>
      </Tile>
    </div>
  );
}
