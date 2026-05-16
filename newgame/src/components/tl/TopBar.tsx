import { useState } from 'react';
import { Image, Pressable, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/theme';
import { TopBarMenu } from './TopBarMenu';
import type { League } from '@/types';

const WORDMARK_WHITE = require('../../../assets/wordmark-white.png');
const WORDMARK_BLACK = require('../../../assets/wordmark-black.png');

// Single-row top bar:  [wordmark▾]  [meta]  [...spacer...]  [actions]  [Recap]
//
// `meta` is small uppercase mono text (e.g. "ROUND 11 · UK"). `actions` is
// where compact chips like Bets/Bankroll live. The Recap pill always anchors
// the right end. Lets the Lineup screen reclaim a whole row of vertical space.
export function TopBar({
  recapLabel,
  league,
  meta,
  actions,
}: {
  recapLabel?: string;
  league?: League | null;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const t = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const onShareCode = async () => {
    if (!league) return;
    setMenuOpen(false);
    try {
      await Share.share({
        message: `Join my Track Limits league "${league.name}" with code ${league.inviteCode}`,
      });
    } catch {
      // ignore
    }
  };

  return (
    <View
      style={{
        paddingTop: 6,
        paddingBottom: 6,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: t.lineSoft,
        backgroundColor: t.bg,
      }}
    >
      <Pressable
        onPress={() => setMenuOpen(true)}
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Image
          source={t.dark ? WORDMARK_WHITE : WORDMARK_BLACK}
          style={{ height: 20, width: 108, resizeMode: 'contain' }}
          accessibilityLabel="Track Limits"
        />
        <Text style={{ color: t.textMute, fontSize: 9, marginLeft: 3 }}>▾</Text>
      </Pressable>

      <TopBarMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        league={league ?? null}
        onOpenLeague={() => {
          setMenuOpen(false);
          if (league) router.push(`/(tabs)/leagues/${league.id}`);
          else router.push('/(tabs)/leagues');
        }}
        onJoin={() => {
          setMenuOpen(false);
          router.push('/(tabs)/leagues/join');
        }}
        onCreate={() => {
          setMenuOpen(false);
          router.push('/(tabs)/leagues/create');
        }}
        onShareCode={onShareCode}
      />

      {meta ? <View style={{ flexShrink: 1 }}>{meta}</View> : null}

      <View style={{ flex: 1 }} />

      {actions ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{actions}</View> : null}

      <Pressable
        onPress={() => router.push('/results')}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            height: 26,
            paddingHorizontal: 8,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: t.line,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: t.success }} />
        <Text
          style={{
            color: t.text,
            fontFamily: t.fMono,
            fontSize: 9,
            fontWeight: '700',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {recapLabel || 'Recap'}
        </Text>
      </Pressable>
    </View>
  );
}
