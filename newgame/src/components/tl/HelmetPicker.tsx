// Owned-helmet grid with instant ACTIVE feedback. Shared by the Profile
// "Change helmet" panel and the Store's "My gear" section. Selection is
// optimistic (purchases.store flips activeCosmetics before the server call
// resolves), so the ring moves the moment you tap.

import { Image, Pressable, Text, View } from 'react-native';
import { useTheme } from '../../theme';

export interface OwnedHelmet {
  id: string;
  name: string;
  url: string;
}

export function HelmetPicker({
  helmets,
  activeId,
  onSelect,
}: {
  helmets: OwnedHelmet[];
  activeId: string | undefined;
  onSelect: (helmetId: string) => void;
}) {
  const t = useTheme();
  if (helmets.length === 0) {
    return (
      <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 13, padding: 16, textAlign: 'center' }}>
        You don't own any helmets yet.
      </Text>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {helmets.map((h) => {
        const active = activeId === h.id;
        return (
          <Pressable
            key={h.id}
            onPress={() => onSelect(h.id)}
            style={{
              flexBasis: '30%',
              flexGrow: 1,
              aspectRatio: 1,
              backgroundColor: t.surface2,
              borderRadius: 10,
              borderWidth: active ? 2 : 1,
              borderColor: active ? t.accent : t.line,
              padding: 8,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Image source={{ uri: h.url }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
            <Text
              style={{ color: t.text, fontFamily: t.fMono, fontSize: 9, fontWeight: '600', letterSpacing: 0.4, textAlign: 'center' }}
              numberOfLines={1}
            >
              {h.name}
            </Text>
            {active ? (
              <Text style={{ color: t.accent, fontFamily: t.fMono, fontSize: 8, fontWeight: '800', letterSpacing: 1 }}>
                ACTIVE
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
