import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel } from './GridBits';
import { activityShortLine, boardShortLine, outcomeTone, type ActivityEntry, type BoardCall, type MoonshotClientConfig } from './moonshot';

/**
 * The league's Moonshot feed (F-108, SPEC §16/§29) on the LEAGUE tab: this race's locked
 * declarations (public only after lock — the server decides), then the season's hits, misses
 * and voids as F-107 wrote them. Nothing here before anyone has called a shot.
 */
export function GridMoonshotFeed({ board, activity, cfg, teamOf, raceLabel, style }: {
  board: BoardCall[];
  activity: ActivityEntry[];
  cfg: MoonshotClientConfig;
  /** F-142: the member's team name (the feed names teams, not players) */
  teamOf: (userId: string) => string;
  /** "RD 19 · SINGAPORE" for the declarations' heading */
  raceLabel: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, mono, scaled } = useSimpleTheme();
  const toneColor = { positive: colors.positive, muted: colors.text.muted, primary: colors.primary } as const;
  if (board.length === 0 && activity.length === 0) return null;
  const line = (text: string, tone: string, key: string) => (
    <Text key={key} style={[mono(11, 'medium'), { color: tone, lineHeight: scaled(16) }]}>{text}</Text>
  );
  return (
    <View style={[{ gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderLight }, style]}>
      {board.length > 0 ? (
        <View style={{ gap: 6 }}>
          <MonoLabel color={colors.primary}>🚀 MOONSHOTS CALLED{raceLabel ? ` · ${raceLabel}` : ''}</MonoLabel>
          {board.map((b) => line(boardShortLine(b, b.teamName || teamOf(b.userId), cfg), colors.text.primary, b.id))}
        </View>
      ) : null}
      {activity.length > 0 ? (
        <View style={{ gap: 6 }}>
          <MonoLabel color={colors.text.muted}>MOONSHOT HISTORY</MonoLabel>
          {activity.slice(0, 8).map((e) => line(activityShortLine(e, teamOf(e.userId), cfg), toneColor[outcomeTone(e.type === 'MOONSHOT_HIT' ? 'HIT' : e.type === 'MOONSHOT_MISSED' ? 'MISSED' : 'VOID')], e.id))}
        </View>
      ) : null}
    </View>
  );
}
