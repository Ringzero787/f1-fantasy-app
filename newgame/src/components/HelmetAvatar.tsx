import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { DEFAULT_HELMET_URL } from '@/data/cosmeticsCatalog';
import { colors, fontSize, radius } from '@/constants/theme';

interface Props {
  // Either pass a userId (will fetch their helmet from tl_users) or pass a
  // helmetUrl directly (faster — for self-display where you already know it).
  userId?: string;
  helmetUrl?: string;
  displayName?: string; // for letter fallback
  size?: number;
  ring?: boolean; // accent ring around the helmet
}

// Cache helmet URLs per user across components so leaderboard rows don't each
// fetch the same user doc separately.
const helmetCache = new Map<string, string>();

export function HelmetAvatar({ userId, helmetUrl, displayName, size = 48, ring }: Props) {
  const [url, setUrl] = useState<string | undefined>(helmetUrl ?? (userId ? helmetCache.get(userId) : undefined));

  useEffect(() => {
    if (helmetUrl) {
      setUrl(helmetUrl);
      return;
    }
    if (!userId) return;
    if (helmetCache.has(userId)) {
      setUrl(helmetCache.get(userId));
      return;
    }
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'tl_users', userId));
        if (!active) return;
        const u = (snap.data()?.activeHelmetUrl as string | undefined) ?? DEFAULT_HELMET_URL;
        helmetCache.set(userId, u);
        setUrl(u);
      } catch {
        helmetCache.set(userId, DEFAULT_HELMET_URL);
        setUrl(DEFAULT_HELMET_URL);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, helmetUrl]);

  const dim = { width: size, height: size, borderRadius: size / 2 };
  const showLetter = !url && displayName;

  return (
    <View
      style={[
        styles.wrap,
        dim,
        ring && { borderColor: colors.accent, borderWidth: 2 },
      ]}
    >
      {url ? (
        <Image source={{ uri: url }} style={[styles.img, dim]} resizeMode="cover" />
      ) : showLetter ? (
        <Text style={[styles.letter, { fontSize: size * 0.4 }]}>
          {displayName!.charAt(0).toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

// External helper — invalidate the cache when a user changes their helmet.
export function invalidateHelmetCache(userId: string) {
  helmetCache.delete(userId);
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  img: { width: '100%', height: '100%' },
  letter: { color: colors.text, fontWeight: '700' },
});
