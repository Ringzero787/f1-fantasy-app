// Global crash reporter — captures fatal JS errors and React render crashes
// and writes them to the shared `errorLogs` collection (rules already allow
// any signed-in user to create; admins read them from Undercut's admin panel).
// Docs are tagged `app: 'tracklimits'` to keep the two apps' reports apart.
//
// Native-layer crashes (missing native module, OOM) happen before or outside
// JS and can NOT be caught here — those still need adb logcat.
//
// Reports are queued in AsyncStorage first, then flushed to Firestore. The
// queue survives the crash: a fatal error usually kills the app before the
// network write finishes, so the doc typically lands on the NEXT launch.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, firebaseAuth } from '../config/firebase';

const QUEUE_KEY = 'tl_crash_queue_v1';
const MAX_QUEUED = 10;
const MAX_PER_SESSION = 5;

interface QueuedReport {
  message: string;
  stack: string;
  isFatal: boolean;
  source: 'global' | 'boundary';
  componentStack?: string;
  appVersion: string;
  platform: string;
  osVersion: string;
  uid: string | null;
  // Device wall-clock; serverTimestamp is added at upload time.
  occurredAt: string;
}

let sessionCount = 0;
let lastMessage = '';

function buildReport(error: unknown, source: 'global' | 'boundary', isFatal: boolean, componentStack?: string): QueuedReport {
  const err = error instanceof Error ? error : new Error(String(error));
  return {
    message: String(err.message ?? 'unknown').slice(0, 1000),
    stack: String(err.stack ?? '(no stack)').slice(0, 8000),
    isFatal,
    source,
    ...(componentStack ? { componentStack: componentStack.slice(0, 4000) } : {}),
    appVersion: Constants.expoConfig?.version ?? 'unknown',
    platform: Platform.OS,
    osVersion: String(Platform.Version),
    uid: firebaseAuth.currentUser?.uid ?? null,
    occurredAt: new Date().toISOString(),
  };
}

async function readQueue(): Promise<QueuedReport[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedReport[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedReport[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUED)));
  } catch {
    // storage failure — nothing else we can do
  }
}

async function uploadReport(report: QueuedReport): Promise<void> {
  await addDoc(collection(db, 'errorLogs'), {
    app: 'tracklimits',
    ...report,
    createdAt: serverTimestamp(),
  });
}

/** Persist a report, then try to upload the whole queue. Never throws. */
export async function reportCrash(
  error: unknown,
  opts: { source: 'global' | 'boundary'; isFatal: boolean; componentStack?: string }
): Promise<void> {
  try {
    if (sessionCount >= MAX_PER_SESSION) return;
    const report = buildReport(error, opts.source, opts.isFatal, opts.componentStack);
    if (report.message === lastMessage) return; // same error re-thrown in a loop
    lastMessage = report.message;
    sessionCount += 1;

    // Queue first — survives the app dying before the network write completes.
    const queue = await readQueue();
    queue.push(report);
    await writeQueue(queue);
    await flushCrashQueue();
  } catch {
    // The reporter must never take the app down with it.
  }
}

/** Upload anything queued (from this session or a previous crash). Never throws. */
export async function flushCrashQueue(): Promise<void> {
  try {
    if (!firebaseAuth.currentUser) return; // errorLogs create requires auth
    const queue = await readQueue();
    if (queue.length === 0) return;
    const remaining: QueuedReport[] = [];
    for (const report of queue) {
      try {
        await uploadReport(report);
      } catch {
        remaining.push(report); // offline / rules — keep for next launch
      }
    }
    await writeQueue(remaining);
  } catch {
    // never throw
  }
}

/**
 * Install the global handler. Call once, at module scope in the root layout,
 * before React renders. Chains to the previous handler so RN's own fatal
 * behavior (dev red screen / release crash) is preserved.
 */
export function installCrashReporter(): void {
  const errorUtils = (globalThis as any).ErrorUtils;
  if (!errorUtils?.setGlobalHandler || (installCrashReporter as any)._installed) return;
  (installCrashReporter as any)._installed = true;

  const previousHandler = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    // The previous (RN) handler kills the process on fatal errors, which would
    // race the AsyncStorage queue write. Hold it off until the report is
    // persisted — capped at 1.2s so a hung write can't zombify the crash.
    let done = false;
    const proceed = () => {
      if (done) return;
      done = true;
      previousHandler?.(error, isFatal);
    };
    setTimeout(proceed, 1200);
    reportCrash(error, { source: 'global', isFatal: !!isFatal }).then(proceed, proceed);
  });

  // Flush leftovers from a previous crashed session once auth is available.
  firebaseAuth.onAuthStateChanged((user) => {
    if (user) void flushCrashQueue();
  });
}
