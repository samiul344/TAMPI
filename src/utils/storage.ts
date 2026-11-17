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
import {
  isLegacyHardcodedShutdownPhrase,
  isLegacyHardcodedWakePhrase,
  parseVoicePhraseList,
} from './wakeWord';

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
  const rawWake = saved.secretWakePhrase?.trim() ?? '';
  const rawShutdown = saved.secretShutdownPhrase?.trim() ?? '';
  const cleanWake = isLegacyHardcodedWakePhrase(rawWake) ? '' : rawWake;
  const cleanShutdown = isLegacyHardcodedShutdownPhrase(rawShutdown)
    ? ''
    : rawShutdown;
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
