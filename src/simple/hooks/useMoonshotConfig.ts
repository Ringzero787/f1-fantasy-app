/**
 * The Moonshot configuration as the screens read it (F-108): `config/app.moonshot` parsed
 * fail-closed, with one exception — demo mode (the sign-in long-press used for screenshots
 * and web verification) opens the feature from round one so the flow can be walked without a
 * config document. A signed-in player never sees the demo values.
 */
import { useMemo } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { parseMoonshotConfig, type MoonshotClientConfig } from '../grid/moonshot';

export const DEMO_MOONSHOT_CONFIG: MoonshotClientConfig = { ...parseMoonshotConfig({ enabled: true, unlockRound: 1 }) };

export function useMoonshotConfig(): MoonshotClientConfig {
  const raw = useRemoteConfigStore((s) => s.appConfig?.moonshot);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  return useMemo(() => (isDemoMode ? DEMO_MOONSHOT_CONFIG : parseMoonshotConfig(raw)), [raw, isDemoMode]);
}
