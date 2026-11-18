import {
  ChatTurn,
  DEFAULT_SETTINGS,
  defaultVoice,
  MemoryItem,
  migratePersonaIfLegacyDefault,
  StudySessionRecord,
  StudyTask,
  TampiSettings,
} from '../types/tampi';
import { parseVoicePhraseList } from './wakeWord';

const LEGACY_UNSCOPED_KEYS = [
  'tampi_settings',
  'tampi_settings_v1',
  'tampi_settings_v2',
  'tampi_voice_commands',
  'tampi_wake_phrase',
  'tampi_shutdown_phrase',
  'tampi_memories',
  'tampi_memories_v1',
  'tampi_tasks',
  'tampi_tasks_v1',
  'tampi_history',
  'tampi_history_v1',
  'tampi_sessions',
  'tampi_sessions_v1',
  'tampi_last_active',
  'secretWakePhrase',
  'secretShutdownPhrase',
  'wakePhrase',
  'shutdownPhrase',
];

/**
 * Purges any legacy unscoped localStorage voice/settings keys so only
 * the currently signed-in user's UID-scoped Firestore settings are used.
 */
export function purgeLegacyUnscopedVoiceStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    for (const key of LEGACY_UNSCOPED_KEYS) {
      localStorage.removeItem(key);
    }
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        !k.startsWith('tampi_u_') &&
        /^(tampi_|secret_?(wake|shutdown)|wake_?phrase|shutdown_?phrase|voice_?commands)/i.test(
          k,
        )
      ) {
        keysToDelete.push(k);
      }
    }
    for (const k of keysToDelete) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage access errors
  }
}

function scopedKey(scopeKey: string, suffix: string): string {
  const safeScope = (scopeKey || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `tampi_u_${safeScope}_${suffix}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadSettings(scopeKey = 'guest'): TampiSettings {
  const saved = safeParse<Partial<TampiSettings>>(
    localStorage.getItem(scopedKey(scopeKey, 'settings_v2')),
    {},
  );
  const cleanWake = saved.secretWakePhrase?.trim() ?? '';
  const cleanShutdown = saved.secretShutdownPhrase?.trim() ?? '';
  const hasValidCodes =
    parseVoicePhraseList(cleanWake).length > 0 &&
    parseVoicePhraseList(cleanShutdown).length > 0;

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    liveVoiceName: saved.liveVoiceName || defaultVoice,
    personaInstructions: migratePersonaIfLegacyDefault(saved.personaInstructions),
    secretWakePhrase: cleanWake,
    secretShutdownPhrase: cleanShutdown,
    voiceCodesConfigured:
      typeof saved.voiceCodesConfigured === 'boolean'
        ? saved.voiceCodesConfigured && hasValidCodes
        : hasValidCodes,
    standbyWakeEnabled: true,
    voiceMode: 'live',
  };
}

export function saveSettings(
  settings: TampiSettings,
  scopeKey = 'guest',
): void {
  localStorage.setItem(
    scopedKey(scopeKey, 'settings_v2'),
    JSON.stringify(settings),
  );
}

export function loadMemories(scopeKey = 'guest'): MemoryItem[] {
  const existing = safeParse<MemoryItem[] | null>(
    localStorage.getItem(scopedKey(scopeKey, 'memories_v2')),
    null,
  );
  return Array.isArray(existing) ? existing : [];
}

export function saveMemories(
  items: MemoryItem[],
  scopeKey = 'guest',
): void {
  localStorage.setItem(
    scopedKey(scopeKey, 'memories_v2'),
    JSON.stringify(items),
  );
}

export function loadTasks(scopeKey = 'guest'): StudyTask[] {
  const existing = safeParse<StudyTask[] | null>(
    localStorage.getItem(scopedKey(scopeKey, 'tasks_v2')),
    null,
  );
  return Array.isArray(existing) ? existing : [];
}

export function saveTasks(tasks: StudyTask[], scopeKey = 'guest'): void {
  localStorage.setItem(
    scopedKey(scopeKey, 'tasks_v2'),
    JSON.stringify(tasks),
  );
}

export function loadSessions(scopeKey = 'guest'): StudySessionRecord[] {
  const existing = safeParse<StudySessionRecord[]>(
    localStorage.getItem(scopedKey(scopeKey, 'sessions_v2')),
    [],
  );
  return Array.isArray(existing) ? existing : [];
}

export function saveSessions(
  sessions: StudySessionRecord[],
  scopeKey = 'guest',
): void {
  localStorage.setItem(
    scopedKey(scopeKey, 'sessions_v2'),
    JSON.stringify(sessions.slice(0, 50)),
  );
}

export function loadHistory(scopeKey = 'guest'): ChatTurn[] {
  const history = safeParse<ChatTurn[]>(
    localStorage.getItem(scopedKey(scopeKey, 'history_v2')),
    [],
  );
  return Array.isArray(history) ? history.slice(-30) : [];
}

export function saveHistory(turns: ChatTurn[], scopeKey = 'guest'): void {
  localStorage.setItem(
    scopedKey(scopeKey, 'history_v2'),
    JSON.stringify(turns.slice(-30)),
  );
}

export function clearHistoryStorage(scopeKey = 'guest'): void {
  localStorage.removeItem(scopedKey(scopeKey, 'history_v2'));
}

export function loadLastActiveAt(scopeKey = 'guest'): string | null {
  return localStorage.getItem(scopedKey(scopeKey, 'last_active_v2'));
}

export function saveLastActiveAt(iso: string, scopeKey = 'guest'): void {
  localStorage.setItem(scopedKey(scopeKey, 'last_active_v2'), iso);
}
