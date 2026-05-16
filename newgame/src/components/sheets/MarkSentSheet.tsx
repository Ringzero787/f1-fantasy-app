import { useState } from 'react';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Sheet } from './Sheet';
import { useTheme } from '@/theme';
import { ledgerService } from '@services/ledger.service';

const APPS = [
  { id: 'Venmo', placeholder: '@username', deepLink: (h: string, amt: number) => `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(h)}&amount=${amt.toFixed(2)}&note=${encodeURIComponent('Track Limits')}` },
  { id: 'Cash App', placeholder: '$cashtag', deepLink: (h: string, amt: number) => `https://cash.app/${encodeURIComponent(h)}/${amt.toFixed(2)}` },
  { id: 'Zelle', placeholder: 'phone or email', deepLink: null as ((h: string, amt: number) => string) | null },
  { id: 'Other', placeholder: 'note (optional)', deepLink: null as ((h: string, amt: number) => string) | null },
] as const;

type AppId = typeof APPS[number]['id'];

export function MarkSentSheet({
  visible,
  onClose,
  leagueId,
  fromUserId,
  fromDisplayName,
  toUserId,
  toDisplayName,
  amount,
  onSent,
}: {
  visible: boolean;
  onClose: () => void;
  leagueId: string;
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  amount: number;
  onSent: () => void;
}) {
  const t = useTheme();
  const [via, setVia] = useState<AppId>('Venmo');
  const [handle, setHandle] = useState(`@${toDisplayName.split(' ')[0].toLowerCase()}`);
  const [submitting, setSubmitting] = useState(false);

  const cur = APPS.find((a) => a.id === via)!;

  const onCopy = async () => {
    try {
      await Clipboard.setStringAsync(`${handle} · $${amount.toFixed(2)} · Track Limits`);
      Alert.alert('Copied', 'Handle + amount + note copied to clipboard.');
    } catch {
      // ignore
    }
  };

  const onDeepLink = async () => {
    if (!cur.deepLink) return;
    const url = cur.deepLink(handle, amount);
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
      } else {
        Alert.alert(`Open ${via}`, `${via} isn't installed. Falling back to clipboard.`);
        await onCopy();
      }
    } catch {
      Alert.alert('Could not open', 'Falling back to clipboard.');
      await onCopy();
    }
  };

  const onMarkSent = async () => {
    setSubmitting(true);
    try {
      await ledgerService.createSettlement({
        leagueId,
        fromUserId,
        fromDisplayName,
        toUserId,
        toDisplayName,
        amount,
        externalNote: via === 'Other' ? handle : `Sent via ${via}: ${handle}`,
      });
      onSent();
      onClose();
    } catch (err) {
      Alert.alert('Mark sent failed', err instanceof Error ? err.message : 'Unknown');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={`$${amount.toFixed(2)} → ${toDisplayName}`} subtitle={`Track Limits records the transfer once ${toDisplayName.split(' ')[0]} confirms it. The app never moves money — you send via ${via}.`}>
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 9,
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontWeight: '700',
          marginBottom: 6,
        }}
      >
        Sent via
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {APPS.map((a) => {
          const active = via === a.id;
          return (
            <Pressable
              key={a.id}
              onPress={() => setVia(a.id)}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 6,
                borderRadius: 8,
                backgroundColor: active ? t.accent : t.surface,
                borderWidth: 1,
                borderColor: active ? t.accent : t.line,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  color: active ? '#0E1116' : t.text,
                  fontFamily: t.fMono,
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                }}
              >
                {a.id}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text
        style={{
          marginTop: 14,
          fontFamily: t.fMono,
          fontSize: 9,
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          fontWeight: '700',
          marginBottom: 6,
        }}
      >
        {via === 'Other' ? 'Note' : `${via} handle`}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 10,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line,
        }}
      >
        <TextInput
          value={handle}
          onChangeText={setHandle}
          placeholder={cur.placeholder}
          placeholderTextColor={t.textMute}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            fontFamily: t.fMono,
            fontSize: 14,
            fontWeight: '600',
            color: t.text,
            letterSpacing: 0.2,
          }}
        />
        <Pressable
          onPress={onCopy}
          style={({ pressed }) => [
            {
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 5,
              backgroundColor: t.accentSoft,
              borderWidth: 1,
              borderColor: t.accentDim,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: t.accent,
              fontFamily: t.fMono,
              fontSize: 9,
              fontWeight: '700',
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            Copy
          </Text>
        </Pressable>
      </View>

      {/* Actions */}
      <View style={{ marginTop: 14, gap: 10 }}>
        {cur.deepLink ? (
          <Pressable
            onPress={onDeepLink}
            style={({ pressed }) => [
              {
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 10,
                backgroundColor: t.surface2,
                borderWidth: 1,
                borderColor: t.line,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: t.text, fontFamily: t.fSans, fontSize: 13, fontWeight: '600' }}>Open {via} with prefilled amount</Text>
            <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 12, opacity: 0.6 }}>↗</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onMarkSent}
          disabled={submitting}
          style={({ pressed }) => [
            {
              paddingVertical: 15,
              paddingHorizontal: 16,
              borderRadius: 10,
              backgroundColor: t.accent,
              alignItems: 'center',
              opacity: submitting ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={{ color: '#0E1116', fontFamily: t.fSans, fontSize: 14, fontWeight: '700', letterSpacing: 0.2 }}>
            {submitting ? 'Recording…' : 'Mark as sent'}
          </Text>
        </Pressable>
      </View>

      <Text
        style={{
          marginTop: 12,
          color: t.textMute,
          fontFamily: t.fMono,
          fontSize: 10,
          letterSpacing: 0.4,
          textAlign: 'center',
          lineHeight: 16,
        }}
      >
        {toDisplayName.split(' ')[0]} will see "Awaiting confirmation" until they confirm.
      </Text>
    </Sheet>
  );
}
