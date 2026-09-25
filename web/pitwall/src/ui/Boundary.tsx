/**
 * One failing frame must not take the portal with it.
 *
 * Without this, anything thrown while rendering unmounts the whole tree and the page goes blank,
 * which is exactly what a real team did: a lineup member the published payload did not carry threw
 * out of a recommendation builder and the Briefing rendered as nothing at all. The data paths are
 * fixed, but a page should degrade to a message either way.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; label: string }
interface State { failed: boolean }

export class Boundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The browser console is the only place this can go: the portal ships no error reporting.
    console.error(`[pitwall] ${this.props.label} failed to render`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <p className="mut" role="status" style={{ margin: '18px 0', fontFamily: 'var(--disp)', fontSize: 13, lineHeight: 1.6 }}>
        This part of {this.props.label} could not be shown. The rest of the page still works, and reloading usually clears it.
      </p>
    );
  }
}
