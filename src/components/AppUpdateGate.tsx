import React, { useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRemoteConfigStore } from '../store/remoteConfig.store';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';

/**
 * Compare two dotted version strings (e.g. "2.1.6" vs "2.10.0").
 * Returns -1 if a<b, 0 if equal, 1 if a>b. Non-numeric segments → 0.
 * Returns null if either string can't be parsed (caller should fail open).
 */
function compareVersions(a: string, b: string): number | null {
  const pa = a.split('.').map((n) => parseInt(n, 10));
  const pb = b.split('.').map((n) => parseInt(n, 10));
  if (pa.some(isNaN) || pb.some(isNaN)) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

const STORE_FALLBACK = 'https://play.google.com/store/apps/details?id=com.undercut.app';

/**
 * Launch-time version gate, driven by the config/app remote-config doc.
 * FAILS OPEN: with no doc / unparseable versions, nothing is shown — a config
 * glitch can never lock players out. Renders nothing in the common case.
 *
 *   current < minVersion    → blocking "Update required" (no dismiss)
 *   current < latestVersion → one-time dismissible "Update available" banner
 */
export function AppUpdateGate() {
  const appConfig = useRemoteConfigStore((s) => s.appConfig);
  const [softDismissed, setSoftDismissed] = useState(false);

  const current = Constants.expoConfig?.version ?? null;

  const { mode, message } = useMemo(() => {
    if (!current) return { mode: 'none' as const, message: '' };
    const { minVersion, latestVersion, updateMessage } = appConfig;

    if (minVersion) {
      const cmp = compareVersions(current, minVersion);
      if (cmp !== null && cmp < 0) {
        return {
          mode: 'force' as const,
          message: updateMessage || 'A newer version is required to keep playing. Please update to continue.',
        };
      }
    }
    if (latestVersion) {
      const cmp = compareVersions(current, latestVersion);
      if (cmp !== null && cmp < 0) {
        return {
          mode: 'soft' as const,
          message: updateMessage || 'A new version of Undercut is available with the latest features and fixes.',
        };
      }
    }
    return { mode: 'none' as const, message: '' };
  }, [current, appConfig]);

  const openStore = () => {
    const url = (Platform.OS === 'ios' ? appConfig.iosUrl : appConfig.androidUrl) || STORE_FALLBACK;
    Linking.openURL(url).catch(() => {});
  };

  if (mode === 'none') return null;
  if (mode === 'soft' && softDismissed) return null;

  const forced = mode === 'force';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!forced) setSoftDismissed(true); }}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{forced ? 'Update Required' : 'Update Available'}</Text>
          <Text style={styles.body}>{message}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={openStore} activeOpacity={0.8}>
            <Text style={styles.primaryBtnText}>Update Now</Text>
          </TouchableOpacity>
          {!forced && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => setSoftDismissed(true)} activeOpacity={0.7}>
              <Text style={styles.secondaryBtnText}>Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.md,
    width: '100%',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#03242b',
    fontWeight: '700',
    fontSize: FONTS.sizes.md,
  },
  secondaryBtn: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  secondaryBtnText: {
    color: COLORS.text.secondary,
    fontSize: FONTS.sizes.sm,
  },
});
