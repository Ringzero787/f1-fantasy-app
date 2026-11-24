/**
 * F-174: the server notice to show on the Team panel now, or null. Reads `config/app.notice` from
 * the config the app already fetches (no extra network call) and this device's dismissals.
 */
import { useMemo } from 'react';
import Constants from 'expo-constants';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { useNoticeStore } from '../../store/notice.store';
import { noticeToShow, type Notice } from '../grid/notice';

export function useNotice(nowMs: number): { notice: Notice | null; dismiss: (id: string) => void } {
  const raw = useRemoteConfigStore((s) => s.appConfig?.notice);
  const dismissedIds = useNoticeStore((s) => s.dismissedIds);
  const dismiss = useNoticeStore((s) => s.dismiss);
  const appVersion = Constants.expoConfig?.version ?? null;
  const notice = useMemo(() => noticeToShow(raw, { nowMs, appVersion, dismissedIds }), [raw, nowMs, appVersion, dismissedIds]);
  return { notice, dismiss };
}
