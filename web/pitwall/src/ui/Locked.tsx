import type { ReactNode } from 'react';
import { can, LOCKED_COPY, type Feature } from '../data/access';
import { useStore } from '../state';

/**
 * A locked frame keeps its real layout and dims it, with the offer over the top: the user sees
 * exactly what they would get rather than an empty space. `inert` keeps the blurred content out
 * of the tab order and away from screen readers, so the only thing behind the veil is the offer.
 */
export function Locked({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { pass, startCheckout, checkout } = useStore();
  if (can(pass, feature)) return <>{children}</>;
  return (
    <div className="locked">
      <div className="locked-body" aria-hidden="true">{children}</div>
      <div className="locked-veil">
        <span className="pill r">Pit Wall Pass</span>
        <p>{LOCKED_COPY[feature] ?? 'Included with the Pit Wall Pass.'}</p>
        <button type="button" className="cta" disabled={checkout === 'starting'} onClick={() => void startCheckout()}>
          {checkout === 'starting' ? 'Opening checkout…' : 'Get the pass · $14.99 a season'}
        </button>
        {checkout && checkout !== 'starting' ? <p className="err" role="alert">{checkout}</p> : null}
      </div>
    </div>
  );
}

/** The same offer as a full tile, for a page that is entirely pass-only. */
export function LockedPage({ feature, title, children }: { feature: Feature; title: string; children: ReactNode }) {
  const { pass } = useStore();
  if (can(pass, feature)) return <>{children}</>;
  return (
    <div className="page">
      <section className="tile c12">
        <div className="th"><span className="lbl">{title}</span><span className="pill r">Pit Wall Pass</span></div>
        <Locked feature={feature}>{children}</Locked>
      </section>
    </div>
  );
}
