/**
 * Read-only backtest of the projection model against an exported history file.
 *   npm run backtest -- /data/pitwall-scratch/cache/history.json [outDir] [runs]
 * Writes nothing to Firestore. The export itself is made by cli/exportHistory.
 */
import * as fs from 'fs';
import * as path from 'path';
import { backtest, type Metrics, type Report } from '../model/backtest';
import { parseHistory } from '../model/loadHistory';

const [file, outDir, runsArg] = process.argv.slice(2);
if (!file) { console.error('usage: backtest <history.json> [outDir] [runs]'); process.exit(2); }
const report: Report = backtest(parseHistory(JSON.parse(fs.readFileSync(file, 'utf8'))), { sim: runsArg ? { runs: Number(runsArg) } : {} });

const f = (n: number, d = 2) => n.toFixed(d);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const line = (name: string, m: Metrics) => `| ${name} | ${m.n} | ${f(m.maeModel)} | ${f(m.maeModelMean)} | ${f(m.maeLast3)} | ${f(m.maeSeasonMean)} | ${pct(m.bandCoverage)} |`;
const md = [
  '# Pit Wall projection model: backtest',
  '',
  `Walk-forward over ${report.races} scored races; ${report.testRaces.length} test races (${report.testRaces.join(', ')}), ${report.rows} entity-race predictions, ${report.runs.toLocaleString()} simulation runs per race.`,
  '',
  '| Set | n | MAE model (median) | MAE model (mean) | MAE last-3 average | MAE season average | Non-retirement outcomes inside floor-ceiling |',
  '|---|---|---|---|---|---|---|',
  line('All', report.all), line('Drivers', report.drivers), line('Constructors', report.constructors),
  '',
  `Improvement over last-3 (points of MAE, positive is better): ${f(report.improvement.mean)}, 90% interval ${f(report.improvement.lo)} to ${f(report.improvement.hi)} (races resampled). The model had the lower error in ${report.improvement.racesModelBetter} of ${report.improvement.racesTotal} races.`,
  '',
  `Retirements: the model predicted ${pct(report.all.dnfCalibration.predicted)} of driver-races would end in a retirement; ${pct(report.all.dnfCalibration.observed)} did. The band covers finishing outcomes; a retirement is scored against that probability, not the band.`,
  '',
  `Price direction (n=${report.price.n}): model ${pct(report.price.modelAccuracy)}, last-3 ${pct(report.price.last3Accuracy)}, always predicting a fall ${pct(report.price.alwaysFallAccuracy)}. The model's direction is a 50/50 blend of the simulation and the last-3 form; the difference from the baseline is within noise at this sample size, so price direction is shown as a lean, not a call.`,
  '',
  `Scoring parity: the worker's scorer matched stored raceScores on ${report.scoringParity.compared - report.scoringParity.mismatches} of ${report.scoringParity.compared} values scored under today's rules. ${report.scoringParity.explained} further values differ for known reasons: rounds 1 to 7 were scored under earlier point rules, and rounds 15 and 16 banked a flat retirement penalty because the lap-proportional one was deployed after them. All outcomes below are re-scored under today's rules.`,
  '',
  `Band scale for the next live projection: ${f(report.bandScale)} (the simulated floor-to-ceiling band is multiplied by this around the median).`,
  '',
  '| Race | Round | MAE model | MAE last-3 | Inside calibrated band |', '|---|---|---|---|---|',
  ...report.perRace.map((r) => `| ${r.raceId} | ${r.round} | ${f(r.maeModel)} | ${f(r.maeLast3)} | ${pct(r.coverage)} |`),
  '',
  `**Verdict: ${report.verdict.ships ? 'passes the gate' : 'does not pass the gate'}.**`,
  ...report.verdict.reasons.map((r) => `- ${r}`),
  '',
].join('\n');
console.log(md);
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'backtest.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'backtest.md'), md);
}
