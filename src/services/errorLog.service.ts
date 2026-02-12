import { addDoc, updateDoc, doc, serverTimestamp, getDocs, query, orderBy, limit, where, Timestamp, getCountFromServer } from 'firebase/firestore';
import { Platform } from 'react-native';
import { collections, db } from '../config/firebase';
import { useAuthStore } from '../store/auth.store';

type Severity = 'error' | 'warn' | 'info';

export interface ErrorLogEntry {
  id: string;
  userId: string;
  context: string;
  message: string;
  stack?: string;
  severity: Severity;
  metadata?: Record<string, unknown>;
  deviceInfo: string;
  appVersion: string;
  reviewed: boolean;
  createdAt: Date;
}

// Rate limiting: dedup same context+message within 5 minutes
const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGS_PER_SESSION = 50;

const recentLogs = new Map<string, number>(); // key -> timestamp
let sessionLogCount = 0;

function shouldLog(context: string, message: string): boolean {
  if (sessionLogCount >= MAX_LOGS_PER_SESSION) return false;

  const key = `${context}::${message}`;
  const now = Date.now();
  const lastLogged = recentLogs.get(key);

  if (lastLogged && now - lastLogged < DEDUP_WINDOW_MS) return false;

  recentLogs.set(key, now);
  sessionLogCount++;
  return true;
}

function getUserId(): string {
  try {
    return useAuthStore.getState().user?.id || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

async function writeLog(
  severity: Severity,
  context: string,
  message: string,
  stack?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!shouldLog(context, message)) return;

  try {
    await addDoc(collections.errorLogs, {
      userId: getUserId(),
      context,
      message,
      ...(stack ? { stack } : {}),
      severity,
      ...(metadata ? { metadata } : {}),
      deviceInfo: Platform.OS,
      appVersion: '1.0.0',
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    // Never let the logger crash the app
    console.log('errorLogService: failed to write log:', e);
  }
}

export const errorLogService = {
  logError(context: string, error: unknown, metadata?: Record<string, unknown>): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    writeLog('error', context, message, stack, metadata);
  },

  logWarn(context: string, message: string, metadata?: Record<string, unknown>): void {
    writeLog('warn', context, message, undefined, metadata);
  },

  logInfo(context: string, message: string, metadata?: Record<string, unknown>): void {
    writeLog('info', context, message, undefined, metadata);
  },

  async fetchLogs(limitCount = 200): Promise<ErrorLogEntry[]> {
    try {
      const q = query(
        collections.errorLogs,
        orderBy('createdAt', 'desc'),
        limit(limitCount),
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId ?? 'unknown',
          context: data.context ?? '',
          message: data.message ?? '',
          stack: data.stack,
          severity: data.severity ?? 'info',
          metadata: data.metadata,
          deviceInfo: data.deviceInfo ?? '',
          appVersion: data.appVersion ?? '',
          reviewed: data.reviewed ?? false,
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt ?? 0),
        } as ErrorLogEntry;
      });
    } catch (e) {
      console.log('errorLogService: failed to fetch logs:', e);
      return [];
    }
  },

  async markLogReviewed(logId: string): Promise<void> {
    try {
      const logRef = doc(db, 'errorLogs', logId);
      await updateDoc(logRef, { reviewed: true });
    } catch (e) {
      console.log('errorLogService: failed to mark log reviewed:', e);
    }
  },

  async getUnreviewedCount(): Promise<number> {
    try {
      const q = query(
        collections.errorLogs,
        where('reviewed', '==', false),
      );
      const snapshot = await getCountFromServer(q);
      return snapshot.data().count;
    } catch (e) {
      console.log('errorLogService: failed to get unreviewed count:', e);
      return 0;
    }
  },
};
