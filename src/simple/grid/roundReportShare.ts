/**
 * Round report as a share (F-120 follow-up): a short card a league can post, with the invite
 * code. Pure so it is tested without a React Native runtime. The screen captures an image of
 * the same facts; this text is the fallback when capture is unavailable (F-083's lesson).
 */
import { calloutNames, signedPoints, type RoundReport } from './roundReport';

const APP = 'https://undercut.humannpc.com';

export interface RoundReportShareInput {
  report: RoundReport;
  label: string | null;
  leagueName: string;
  inviteCode?: string | null;
}

export function roundReportText({ report, label, leagueName, inviteCode }: RoundReportShareInput): string {
  const lines: string[] = ['UNDERCUT · ROUND REPORT'];
  const head = [leagueName.trim(), label].filter(Boolean).join(' · ');
  if (head) lines.push(head.toUpperCase());
  lines.push('');

  if (report.me) {
    const change = report.me.change == null ? '' : `  ${signedPoints(report.me.change)} VS LAST`;
    lines.push(`YOU  P${report.me.rank}/${report.me.of}  ${signedPoints(report.me.points)}${change}`);
    lines.push('');
  }

  if (report.podium.length) {
    lines.push('PODIUM');
    for (const p of report.podium) {
      const who = p.isMe ? `${p.name} · YOU` : p.name;
      lines.push(`${String(p.rank).padStart(2, '0')}  ${who}  ${signedPoints(p.points)}`);
    }
    lines.push('');
  }

  if (report.climb) lines.push(`CLIMB  ${calloutNames(report.climb)}  +${report.climb.value}`);
  if (report.drop) lines.push(`DROP  ${calloutNames(report.drop)}  ${report.drop.value}`);
  if (report.callOfTheRound) {
    const c = report.callOfTheRound;
    lines.push(`MOONSHOT  ${c.who.isMe ? `${c.who.name} · YOU` : c.who.name}  ${signedPoints(c.amount)}`);
  }

  if (inviteCode) {
    lines.push('');
    lines.push(`JOIN  ${inviteCode}`);
    lines.push(`${APP}/join?code=${inviteCode}`);
  }

  return lines.join('\n').trim();
}
