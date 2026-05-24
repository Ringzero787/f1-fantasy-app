// AppConfigGate — reads the remote tl_config/app doc and:
//   1. Blocks the whole app with an "update required" screen when the running
//      build's versionCode is below minSupportedVersionCode.
//   2. Shows a dismissible notice banner at the top when notice.enabled.
//
// Fails open: while the config is loading, or if it can't be read, children
// render normally. Only a definitive "below the floor" reading blocks.

import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useAppConfig } from '@/hooks/useAppConfig';

const DEFAULT_UPDATE_URL = 'https://play.google.com/store/apps/details?id=com.tracklimits.app';

// Runtime versionCode of the installed build (from the bundled app.config).
function currentVersionCode(): number | null {
  const vc = Constants.expoConfig?.android?.versionCode;
  return typeof vc === 'number' ? vc : null;
}

export function AppConfigGate({ children }: { children: React.ReactNode }) {
  const { data: config } = useAppConfig();
  const vc = currentVersionCode();

  const mustUpdate =
    !!config?.minSupportedVersionCode &&
    vc != null &&
    vc < config.minSupportedVersionCode;

  if (mustUpdate) {
    return <UpdateRequired url={config?.updateUrl || DEFAULT_UPDATE_URL} />;
  }

  return (
    <View style={{ flex: 1 }}>
      {children}
      <NoticeBanner config={config} />
    </View>
  );
}

function UpdateRequired({ url }: { url: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: t.accentSoft, borderWidth: 1, borderColor: t.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <Text style={{ fontFamily: t.fDisp, fontSize: 26, fontWeight: '700', color: t.accent }}>↑</Text>
      </View>
      <Text style={{ fontFamily: t.fDisp, fontSize: 22, fontWeight: '700', color: t.text, letterSpacing: -0.4, textAlign: 'center' }}>
        Update required
      </Text>
      <Text style={{ fontFamily: t.fSans, fontSize: 14, color: t.textDim, textAlign: 'center', marginTop: 10, lineHeight: 20, maxWidth: 300 }}>
        This version of Track Limits is out of date. Update to keep playing — it only takes a moment.
      </Text>
      <Pressable
        onPress={() => Linking.openURL(url)}
        style={({ pressed }) => ({
          marginTop: 24,
          height: 50,
          paddingHorizontal: 28,
          borderRadius: 12,
          backgroundColor: t.accent,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: '#0E1116', fontFamily: t.fSans, fontWeight: '600', fontSize: 15 }}>Update now</Text>
      </Pressable>
    </View>
  );
}

function NoticeBanner({ config }: { config: ReturnType<typeof useAppConfig>['data'] }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const notice = config?.notice;
  // A notice is keyed by id; dismissing one id won't suppress a later, different
  // notice. Session-scoped (re-shows on relaunch) to keep it dependency-free.
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  if (!notice?.enabled || !notice.title) return null;
  const noticeId = notice.id || notice.title;
  if (dismissedId === noticeId) return null;

  const warn = notice.severity === 'warn';
  const color = warn ? t.warn : t.accent;
  const bg = warn ? 'rgba(224,164,88,0.12)' : t.accentSoft;
  const border = warn ? 'rgba(224,164,88,0.4)' : t.accentDim;

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 6, paddingHorizontal: 10, paddingBottom: 8, backgroundColor: bg, borderBottomWidth: 1, borderBottomColor: border }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 10, fontWeight: '800', color, letterSpacing: 1, textTransform: 'uppercase' }}>
            {notice.title}
          </Text>
          {notice.body ? (
            <Text style={{ fontFamily: t.fSans, fontSize: 12, color: t.text, marginTop: 2, lineHeight: 16 }}>{notice.body}</Text>
          ) : null}
        </View>
        {notice.dismissible !== false ? (
          <Pressable onPress={() => setDismissedId(noticeId)} hitSlop={10} style={{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }}>
            <Text style={{ color: t.textDim, fontFamily: t.fMono, fontSize: 13, fontWeight: '700' }}>×</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
