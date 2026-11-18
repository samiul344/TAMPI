import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, User } from 'firebase/auth';
import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  ChatTurn,
  defaultVoice,
  MemoryItem,
  SmartNote,
  StudySessionRecord,
  StudyTask,
  TampiSettings,
} from '../types/tampi';
import { parseVoicePhraseList } from '../utils/wakeWord';

const SETTINGS_DOC_ID = 'preferences';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

function clampString(val: string | undefined, max: number): string {
  return (val ?? '').slice(0, max);
}

function sanitizeId(rawId: string | undefined, prefix: string): string {
  const clean = (rawId ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (clean.length >= 1 && clean.length <= 128) return clean;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function trimPhrase(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function extractSettingsPatch(
  data: Record<string, unknown>,
): Partial<TampiSettings> {
  const patch: Partial<TampiSettings> = {};
  if (typeof data.personaInstructions === 'string' && data.personaInstructions) {
    patch.personaInstructions = data.personaInstructions;
  }
  if (typeof data.customGlbUrl === 'string') {
    patch.customGlbUrl = data.customGlbUrl;
  }
  if (data.voiceMode === 'browser' || data.voiceMode === 'live') {
    patch.voiceMode = data.voiceMode;
  }
  if (data.language === 'en-US' || data.language === 'bn-BD') {
    patch.language = data.language;
  }
  if (
    data.liveVoiceName === 'Zephyr' ||
    data.liveVoiceName === 'Puck' ||
    data.liveVoiceName === 'Kore' ||
    data.liveVoiceName === 'Fenrir' ||
    data.liveVoiceName === 'Charon'
  ) {
    patch.liveVoiceName = data.liveVoiceName;
  }
  if (typeof data.speechRate === 'number') {
    patch.speechRate = data.speechRate;
  }
  if (typeof data.speechPitch === 'number') {
    patch.speechPitch = data.speechPitch;
  }
  if (typeof data.handsFreeLoop === 'boolean') {
    patch.handsFreeLoop = data.handsFreeLoop;
  }
  if (typeof data.standbyWakeEnabled === 'boolean') {
    patch.standbyWakeEnabled = data.standbyWakeEnabled;
  }
  if (typeof data.secretWakePhrase === 'string') {
    patch.secretWakePhrase = trimPhrase(data.secretWakePhrase);
  }
  if (typeof data.secretShutdownPhrase === 'string') {
    patch.secretShutdownPhrase = trimPhrase(data.secretShutdownPhrase);
  }
  if (typeof data.voiceCodesConfigured === 'boolean') {
    const cleanWake = patch.secretWakePhrase ?? '';
    const cleanShutdown = patch.secretShutdownPhrase ?? '';
    const validPhrases =
      parseVoicePhraseList(cleanWake).length > 0 &&
      parseVoicePhraseList(cleanShutdown).length > 0;
    patch.voiceCodesConfigured = data.voiceCodesConfigured && validPhrases;
  }
  if (typeof data.lastActiveAt === 'string' && data.lastActiveAt) {
    patch.lastActiveAt = data.lastActiveAt;
  }
  return patch;
}

export interface SyncUserSettingsResult {
  voiceCodesConfigured: boolean;
  settingsPatch: Partial<TampiSettings>;
}

export async function ensureAndSyncUserProfile(
  user: User,
  settings: TampiSettings,
  isNewUpdate = false,
): Promise<SyncUserSettingsResult> {
  const profilePath = `users/${user.uid}`;
  const profileRef = doc(db, 'users', user.uid);
  const settingsPath = `users/${user.uid}/settings/${SETTINGS_DOC_ID}`;
  const settingsRef = doc(db, 'users', user.uid, 'settings', SETTINGS_DOC_ID);
  const fallbackName = user.email ? user.email.split('@')[0] : 'Friend';

  const cleanWake = trimPhrase(settings.secretWakePhrase);
  const cleanShutdown = trimPhrase(settings.secretShutdownPhrase);
  const hasLocalConfigured =
    Boolean(settings.voiceCodesConfigured) &&
    parseVoicePhraseList(cleanWake).length > 0 &&
    parseVoicePhraseList(cleanShutdown).length > 0;

  const baseProfilePayload: Record<string, unknown> = {
    email: clampString(user.email ?? 'user@example.com', 254),
    displayName: clampString(user.displayName || fallbackName, 120),
    personaInstructions: clampString(settings.personaInstructions, 4000),
    customGlbUrl: settings.customGlbUrl.startsWith('blob:')
      ? ''
      : clampString(settings.customGlbUrl, 1000),
    voiceMode: settings.voiceMode,
    language: settings.language,
    liveVoiceName: settings.liveVoiceName || defaultVoice,
    speechRate: Math.min(2.0, Math.max(0.5, settings.speechRate)),
    speechPitch: Math.min(2.0, Math.max(0.5, settings.speechPitch)),
    handsFreeLoop: Boolean(settings.handsFreeLoop),
    standbyWakeEnabled: Boolean(settings.standbyWakeEnabled),
    secretWakePhrase: clampString(cleanWake, 500),
    secretShutdownPhrase: clampString(cleanShutdown, 500),
    voiceCodesConfigured: hasLocalConfigured,
    updatedAt: serverTimestamp(),
  };

  if (settings.lastActiveAt) {
    baseProfilePayload.lastActiveAt = clampString(settings.lastActiveAt, 64);
  }

  try {
    const existingProfileSnap = await getDoc(profileRef);
    if (!existingProfileSnap.exists()) {
      await setDoc(profileRef, {
        uid: user.uid,
        ...baseProfilePayload,
        createdAt: serverTimestamp(),
      });
    } else if (isNewUpdate) {
      await updateDoc(profileRef, baseProfilePayload);
    }
  } catch (error) {
    handleFirestoreError(
      error,
      isNewUpdate ? OperationType.UPDATE : OperationType.WRITE,
      profilePath,
    );
  }

  try {
    const existingSettingsSnap = await getDoc(settingsRef);
    if (!existingSettingsSnap.exists()) {
      const initialWake = isNewUpdate ? cleanWake : '';
      const initialShutdown = isNewUpdate ? cleanShutdown : '';
      const initialConfigured = isNewUpdate ? hasLocalConfigured : false;

      const settingsCreatePayload: Record<string, unknown> = {
        userId: user.uid,
        secretWakePhrase: clampString(initialWake, 500),
        secretShutdownPhrase: clampString(initialShutdown, 500),
        voiceCodesConfigured: initialConfigured,
        personaInstructions: clampString(settings.personaInstructions, 4000),
        customGlbUrl: settings.customGlbUrl.startsWith('blob:')
          ? ''
          : clampString(settings.customGlbUrl, 1000),
        voiceMode: settings.voiceMode,
        language: settings.language,
        liveVoiceName: settings.liveVoiceName || defaultVoice,
        speechRate: Math.min(2.0, Math.max(0.5, settings.speechRate)),
        speechPitch: Math.min(2.0, Math.max(0.5, settings.speechPitch)),
        handsFreeLoop: Boolean(settings.handsFreeLoop),
        standbyWakeEnabled: Boolean(settings.standbyWakeEnabled),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (settings.lastActiveAt) {
        settingsCreatePayload.lastActiveAt = clampString(settings.lastActiveAt, 64);
      }

      await setDoc(settingsRef, settingsCreatePayload);

      return {
        voiceCodesConfigured: initialConfigured,
        settingsPatch: {
          secretWakePhrase: initialWake,
          secretShutdownPhrase: initialShutdown,
          voiceCodesConfigured: initialConfigured,
        },
      };
    }

    const existingSettingsData = existingSettingsSnap.data() as Record<
      string,
      unknown
    >;

    if (isNewUpdate) {
      const settingsUpdatePayload: Record<string, unknown> = {
        secretWakePhrase: clampString(cleanWake, 500),
        secretShutdownPhrase: clampString(cleanShutdown, 500),
        voiceCodesConfigured: hasLocalConfigured,
        personaInstructions: clampString(settings.personaInstructions, 4000),
        customGlbUrl: settings.customGlbUrl.startsWith('blob:')
          ? ''
          : clampString(settings.customGlbUrl, 1000),
        voiceMode: settings.voiceMode,
        language: settings.language,
        liveVoiceName: settings.liveVoiceName || defaultVoice,
        speechRate: Math.min(2.0, Math.max(0.5, settings.speechRate)),
        speechPitch: Math.min(2.0, Math.max(0.5, settings.speechPitch)),
        handsFreeLoop: Boolean(settings.handsFreeLoop),
        standbyWakeEnabled: Boolean(settings.standbyWakeEnabled),
        updatedAt: serverTimestamp(),
      };
      if (settings.lastActiveAt) {
        settingsUpdatePayload.lastActiveAt = clampString(settings.lastActiveAt, 64);
      }
      await updateDoc(settingsRef, settingsUpdatePayload);
      return {
        voiceCodesConfigured: hasLocalConfigured,
        settingsPatch: {
          secretWakePhrase: cleanWake,
          secretShutdownPhrase: cleanShutdown,
          voiceCodesConfigured: hasLocalConfigured,
        },
      };
    }

    const patch = extractSettingsPatch(existingSettingsData);
    const configured = Boolean(patch.voiceCodesConfigured);
    return {
      voiceCodesConfigured: configured,
      settingsPatch: patch,
    };
  } catch (error) {
    handleFirestoreError(
      error,
      isNewUpdate ? OperationType.UPDATE : OperationType.WRITE,
      settingsPath,
    );
  }
}

export async function saveUserVoiceCommands(
  user: User,
  wakePhrase: string,
  shutdownPhrase: string,
  currentSettings: TampiSettings,
): Promise<void> {
  const cleanWake = clampString(wakePhrase.trim(), 500);
  const cleanShutdown = clampString(shutdownPhrase.trim(), 500);
  const configured =
    parseVoicePhraseList(cleanWake).length > 0 &&
    parseVoicePhraseList(cleanShutdown).length > 0;

  const profilePath = `users/${user.uid}`;
  const profileRef = doc(db, 'users', user.uid);
  const settingsPath = `users/${user.uid}/settings/${SETTINGS_DOC_ID}`;
  const settingsRef = doc(db, 'users', user.uid, 'settings', SETTINGS_DOC_ID);
  const fallbackName = user.email ? user.email.split('@')[0] : 'Friend';

  try {
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        uid: user.uid,
        email: clampString(user.email ?? 'user@example.com', 254),
        displayName: clampString(user.displayName || fallbackName, 120),
        personaInstructions: clampString(currentSettings.personaInstructions, 4000),
        customGlbUrl: currentSettings.customGlbUrl.startsWith('blob:')
          ? ''
          : clampString(currentSettings.customGlbUrl, 1000),
        voiceMode: currentSettings.voiceMode,
        language: currentSettings.language,
        liveVoiceName: currentSettings.liveVoiceName || defaultVoice,
        speechRate: Math.min(2.0, Math.max(0.5, currentSettings.speechRate)),
        speechPitch: Math.min(2.0, Math.max(0.5, currentSettings.speechPitch)),
        handsFreeLoop: Boolean(currentSettings.handsFreeLoop),
        standbyWakeEnabled: Boolean(currentSettings.standbyWakeEnabled),
        secretWakePhrase: cleanWake,
        secretShutdownPhrase: cleanShutdown,
        voiceCodesConfigured: configured,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(profileRef, {
        secretWakePhrase: cleanWake,
        secretShutdownPhrase: cleanShutdown,
        voiceCodesConfigured: configured,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }

  try {
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        userId: user.uid,
        secretWakePhrase: cleanWake,
        secretShutdownPhrase: cleanShutdown,
        voiceCodesConfigured: configured,
        personaInstructions: clampString(currentSettings.personaInstructions, 4000),
        customGlbUrl: currentSettings.customGlbUrl.startsWith('blob:')
          ? ''
          : clampString(currentSettings.customGlbUrl, 1000),
        voiceMode: currentSettings.voiceMode,
        language: currentSettings.language,
        liveVoiceName: currentSettings.liveVoiceName || defaultVoice,
        speechRate: Math.min(2.0, Math.max(0.5, currentSettings.speechRate)),
        speechPitch: Math.min(2.0, Math.max(0.5, currentSettings.speechPitch)),
        handsFreeLoop: Boolean(currentSettings.handsFreeLoop),
        standbyWakeEnabled: Boolean(currentSettings.standbyWakeEnabled),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(settingsRef, {
        secretWakePhrase: cleanWake,
        secretShutdownPhrase: cleanShutdown,
        voiceCodesConfigured: configured,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, settingsPath);
  }
}

export async function touchUserLastActive(
  uid: string,
  isoTimestamp: string,
): Promise<void> {
  const path = `users/${uid}/settings/${SETTINGS_DOC_ID}`;
  const profileRef = doc(db, 'users', uid);
  const settingsRef = doc(db, 'users', uid, 'settings', SETTINGS_DOC_ID);
  try {
    await updateDoc(profileRef, {
      lastActiveAt: clampString(isoTimestamp, 64),
      updatedAt: serverTimestamp(),
    });
    await updateDoc(settingsRef, {
      lastActiveAt: clampString(isoTimestamp, 64),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    // Non-fatal if doc hasn't finished initial create yet
    console.warn('Could not update lastActiveAt:', error);
    void path;
  }
}

export function subscribeUserProfile(
  uid: string,
  onSettingsLoaded: (patch: Partial<TampiSettings>) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/settings/${SETTINGS_DOC_ID}`;
  const ref = doc(db, 'users', uid, 'settings', SETTINGS_DOC_ID);

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const data = snap.data() as Record<string, unknown>;
      onSettingsLoaded(extractSettingsPatch(data));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (e) {
        onError?.(e as Error);
      }
    },
  );
}

export function subscribeUserMemories(
  uid: string,
  onMemoriesLoaded: (items: MemoryItem[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/memories`;
  const q = query(
    collection(db, 'users', uid, 'memories'),
    where('userId', '==', uid),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: MemoryItem[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const ts = data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();
          return {
            id: d.id,
            category:
              data.category === 'profile' ||
              data.category === 'reminder' ||
              data.category === 'note'
                ? data.category
                : 'note',
            content: String(data.content ?? ''),
            createdAt: ts,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onMemoriesLoaded(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError?.(e as Error);
      }
    },
  );
}

export async function addFirestoreMemory(
  uid: string,
  category: MemoryItem['category'],
  content: string,
  customId?: string,
): Promise<string> {
  const memoryId = sanitizeId(customId, 'mem');
  const path = `users/${uid}/memories/${memoryId}`;
  const safeContent = clampString(content.trim(), 1000);
  if (!safeContent) return memoryId;

  try {
    await setDoc(doc(db, 'users', uid, 'memories', memoryId), {
      userId: uid,
      category,
      content: safeContent,
      createdAt: serverTimestamp(),
    });
    return memoryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteFirestoreMemory(
  uid: string,
  memoryId: string,
): Promise<void> {
  const path = `users/${uid}/memories/${memoryId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'memories', memoryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserHistory(
  uid: string,
  onHistoryLoaded: (turns: ChatTurn[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/history`;
  const q = query(
    collection(db, 'users', uid, 'history'),
    where('userId', '==', uid),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const turns: ChatTurn[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const ts =
            typeof data.timestamp === 'string' && data.timestamp
              ? data.timestamp
              : data.createdAt?.toDate
                ? data.createdAt.toDate().toISOString()
                : new Date().toISOString();
          return {
            id: d.id,
            role: (data.role === 'model' ? 'model' : 'user') as 'user' | 'model',
            text: String(data.text ?? ''),
            timestamp: ts,
          };
        })
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .slice(-30);
      onHistoryLoaded(turns);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError?.(e as Error);
      }
    },
  );
}

export async function addFirestoreHistoryTurn(
  uid: string,
  turn: ChatTurn,
): Promise<void> {
  const turnId = sanitizeId(turn.id, 'turn');
  const path = `users/${uid}/history/${turnId}`;
  const safeText = clampString(turn.text.trim(), 4000);
  if (!safeText) return;

  try {
    await setDoc(doc(db, 'users', uid, 'history', turnId), {
      userId: uid,
      role: turn.role,
      text: safeText,
      timestamp: clampString(turn.timestamp, 64),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function clearFirestoreHistory(uid: string): Promise<void> {
  const path = `users/${uid}/history`;
  try {
    const q = query(
      collection(db, 'users', uid, 'history'),
      where('userId', '==', uid),
    );
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserTasks(
  uid: string,
  onTasksLoaded: (tasks: StudyTask[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/tasks`;
  const q = query(
    collection(db, 'users', uid, 'tasks'),
    where('userId', '==', uid),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const tasks: StudyTask[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const ts = data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();
          return {
            id: d.id,
            title: String(data.title ?? ''),
            subject:
              typeof data.subject === 'string' && data.subject
                ? data.subject
                : undefined,
            dueLabel:
              typeof data.dueLabel === 'string' && data.dueLabel
                ? data.dueLabel
                : undefined,
            completed: Boolean(data.completed),
            createdAt: ts,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onTasksLoaded(tasks);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError?.(e as Error);
      }
    },
  );
}

export async function addFirestoreTask(
  uid: string,
  task: StudyTask,
): Promise<void> {
  const taskId = sanitizeId(task.id, 'task');
  const path = `users/${uid}/tasks/${taskId}`;
  const safeTitle = clampString(task.title.trim(), 300);
  if (!safeTitle) return;

  const payload: Record<string, unknown> = {
    userId: uid,
    title: safeTitle,
    completed: Boolean(task.completed),
    createdAt: serverTimestamp(),
  };
  if (task.subject?.trim()) {
    payload.subject = clampString(task.subject.trim(), 120);
  }
  if (task.dueLabel?.trim()) {
    payload.dueLabel = clampString(task.dueLabel.trim(), 120);
  }

  try {
    await setDoc(doc(db, 'users', uid, 'tasks', taskId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleFirestoreTask(
  uid: string,
  taskId: string,
  completed: boolean,
): Promise<void> {
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'tasks', taskId), {
      completed,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreTask(
  uid: string,
  taskId: string,
): Promise<void> {
  const path = `users/${uid}/tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'tasks', taskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserSessions(
  uid: string,
  onSessionsLoaded: (sessions: StudySessionRecord[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/sessions`;
  const q = query(
    collection(db, 'users', uid, 'sessions'),
    where('userId', '==', uid),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const sessions: StudySessionRecord[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const ts = data.completedAt?.toDate
            ? data.completedAt.toDate().toISOString()
            : new Date().toISOString();
          return {
            id: d.id,
            label: String(data.label ?? 'Study Focus'),
            durationMinutes: Number(data.durationMinutes ?? 25),
            completedAt: ts,
          };
        })
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        .slice(0, 50);
      onSessionsLoaded(sessions);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError?.(e as Error);
      }
    },
  );
}

export async function addFirestoreSession(
  uid: string,
  session: StudySessionRecord,
): Promise<void> {
  const sessionId = sanitizeId(session.id, 'sess');
  const path = `users/${uid}/sessions/${sessionId}`;
  const safeLabel = clampString(session.label.trim() || 'Study Focus', 200);
  const safeDuration = Math.min(600, Math.max(1, Math.round(session.durationMinutes)));

  try {
    await setDoc(doc(db, 'users', uid, 'sessions', sessionId), {
      userId: uid,
      label: safeLabel,
      durationMinutes: safeDuration,
      completedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserNotes(
  uid: string,
  onNotesLoaded: (notes: SmartNote[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const path = `users/${uid}/notes`;
  const q = query(
    collection(db, 'users', uid, 'notes'),
    where('userId', '==', uid),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const notes: SmartNote[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          const createdTs = data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();
          const updatedTs = data.updatedAt?.toDate
            ? data.updatedAt.toDate().toISOString()
            : createdTs;
          return {
            id: d.id,
            kind: (data.kind === 'reminder' ? 'reminder' : 'note') as
              | 'note'
              | 'reminder',
            content: String(data.content ?? ''),
            remindAt:
              typeof data.remindAt === 'string' && data.remindAt
                ? data.remindAt
                : undefined,
            dueLabel:
              typeof data.dueLabel === 'string' && data.dueLabel
                ? data.dueLabel
                : undefined,
            reminded: Boolean(data.reminded),
            completed: Boolean(data.completed),
            createdAt: createdTs,
            updatedAt: updatedTs,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onNotesLoaded(notes);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (e) {
        onError?.(e as Error);
      }
    },
  );
}

export async function addFirestoreNote(
  uid: string,
  note: SmartNote,
): Promise<string> {
  const noteId = sanitizeId(note.id, 'note');
  const path = `users/${uid}/notes/${noteId}`;
  const safeContent = clampString(note.content.trim(), 1000);
  if (!safeContent) return noteId;

  const payload: Record<string, unknown> = {
    userId: uid,
    kind: note.kind === 'reminder' ? 'reminder' : 'note',
    content: safeContent,
    reminded: Boolean(note.reminded),
    completed: Boolean(note.completed),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (note.remindAt?.trim()) {
    payload.remindAt = clampString(note.remindAt.trim(), 64);
  }
  if (note.dueLabel?.trim()) {
    payload.dueLabel = clampString(note.dueLabel.trim(), 120);
  }

  try {
    await setDoc(doc(db, 'users', uid, 'notes', noteId), payload);
    return noteId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFirestoreNote(
  uid: string,
  noteId: string,
  patch: Partial<
    Pick<
      SmartNote,
      'kind' | 'content' | 'remindAt' | 'dueLabel' | 'reminded' | 'completed'
    >
  >,
): Promise<void> {
  const path = `users/${uid}/notes/${noteId}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (patch.kind !== undefined) {
    payload.kind = patch.kind === 'reminder' ? 'reminder' : 'note';
  }
  if (patch.content !== undefined) {
    const safeContent = clampString(patch.content.trim(), 1000);
    if (safeContent) payload.content = safeContent;
  }
  if ('remindAt' in patch) {
    payload.remindAt = patch.remindAt?.trim()
      ? clampString(patch.remindAt.trim(), 64)
      : deleteField();
  }
  if ('dueLabel' in patch) {
    payload.dueLabel = patch.dueLabel?.trim()
      ? clampString(patch.dueLabel.trim(), 120)
      : deleteField();
  }
  if (patch.reminded !== undefined) {
    payload.reminded = Boolean(patch.reminded);
  }
  if (patch.completed !== undefined) {
    payload.completed = Boolean(patch.completed);
  }

  try {
    await updateDoc(doc(db, 'users', uid, 'notes', noteId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreNote(
  uid: string,
  noteId: string,
): Promise<void> {
  const path = `users/${uid}/notes/${noteId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'notes', noteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
