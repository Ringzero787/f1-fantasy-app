import { can, type Feature } from '../data/access';
import { useStore } from '../state';

/**
 * A line across the top of a page telling a reader without a pass what they are not seeing, and
 * offering it. The blurred frames further down say it too, but a reader who has scrolled past
 * them — or who came straight to the lineup lab — should not have to work out why some of the
 * page is missing.
 *
 * Nothing at all for a pass holder: they have already paid and do not need selling to.
 */
export function PassBar({ feature, what }: { feature: Feature; what: string }) {
  const { pass, startCheckout, checkout } = useStore();
  if (can(pass, feature)) return null;
  return (
    <div className="passbar c12" role="note">
      <span className="pill r">Pit Wall Pass</span>
      <span className="passbar-what">{what}</span>
      <button type="button" className="cta sm" disabled={checkout === 'starting'} onClick={() => void startCheckout()}>
        {checkout === 'starting' ? 'Opening checkout…' : '$14.99 a season'}
      </button>
      {checkout && checkout !== 'starting' ? <span className="err" role="alert">{checkout}</span> : null}
    </div>
  );
}
