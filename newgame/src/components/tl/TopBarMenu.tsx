// TopBar dropdown menu — opens on wordmark tap. Shows current league context
// (or "You're solo") with quick-jump actions for league management.

import { Modal, Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme';
import type { League } from '@/types';

export function TopBarMenu({
  visible,
  onClose,
  league,
  onOpenLeague,
  onJoin,
  onCreate,
  onShareCode,
}: {
  visible: boolean;
  onClose: () => void;
  league: League | null;
  onOpenLeague: () => void;
  onJoin: () => void;
  onCreate: () => void;
  onShareCode: () => void;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} />
      <View
        style={{
          position: 'absolute',
          top: 56,
          left: 12,
          width: 260,
          padding: 6,
          backgroundColor: t.surface2,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 10,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        {league ? (
          <>
            <Text
              style={{
                paddingHorizontal: 10,
                paddingTop: 8,
                paddingBottom: 4,
                fontFamily: t.fMono,
                fontSize: 9,
                fontWeight: '600',
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              Current league
            </Text>
            <View style={{ paddingHorizontal: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: t.lineSoft, marginBottom: 4 }}>
              <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 14, color: t.text, letterSpacing: -0.2 }}>
                {league.name}
              </Text>
              <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textDim, marginTop: 2 }}>
                {league.memberCount} of {league.maxMembers} · code {league.inviteCode}
              </Text>
            </View>
            <MenuRow icon="◧" label="Open league" sub="Standings · ledger · invite" onPress={onOpenLeague} />
            <MenuRow icon="✦" label="Invite friends" sub={`Share code ${league.inviteCode}`} onPress={onShareCode} />
            <MenuRow icon="⊞" label="Join another" sub="Enter 6-char code" onPress={onJoin} />
            <MenuRow icon="+" label="Create new league" sub="Run your own" onPress={onCreate} isLast />
          </>
        ) : (
          <>
            <Text
              style={{
                paddingHorizontal: 10,
                paddingTop: 8,
                paddingBottom: 4,
                fontFamily: t.fMono,
                fontSize: 9,
                fontWeight: '600',
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              You're solo
            </Text>
            <MenuRow icon="+" label="Create a league" sub="Invite friends" onPress={onCreate} />
            <MenuRow icon="⊞" label="Join with code" sub="6-char invite" onPress={onJoin} isLast />
          </>
        )}
      </View>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  sub,
  onPress,
  isLast,
}: {
  icon: string;
  label: string;
  sub: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 7,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: isLast ? 0 : 2,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textDim }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: t.fSans, fontSize: 13, fontWeight: '600', color: t.text }}>{label}</Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 0.4, marginTop: 1 }}>
          {sub}
        </Text>
      </View>
      <Text style={{ color: t.textMute, fontSize: 12 }}>›</Text>
    </Pressable>
  );
}
