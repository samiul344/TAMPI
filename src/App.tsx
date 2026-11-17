import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Moon,
  ShieldCheck,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { TampiStage } from './components/TampiStage';
import { StarkHud } from './components/StarkHud';
import { TopBar } from './components/TopBar';
import { VoiceDock } from './components/VoiceDock';
import { MemoryDrawer } from './components/MemoryDrawer';
import { SettingsModal } from './components/SettingsModal';
import { VoiceCommandsModal } from './components/VoiceCommandsModal';
import {
  AssistantState,
  AvatarEmotion,
  ChatApiResponse,
  ChatTurn,
  defaultVoice,
  LanguageCode,
  LipSyncWeights,
  MemoryItem,
  migratePersonaIfLegacyDefault,
  StructuredAction,
  StudySessionRecord,
  StudyTask,
  StudyTimerState,
  TampiSettings,
  VrmMetadata,
  WakeMoodSeed,
} from './types/tampi';
import {
  addFirestoreHistoryTurn,
  addFirestoreMemory,
  addFirestoreSession,
  addFirestoreTask,
  auth,
  clearFirestoreHistory,
  deleteFirestoreMemory,
  deleteFirestoreTask,
  ensureAndSyncUserProfile,
  googleAuthProvider,
  saveUserVoiceCommands,
  subscribeUserHistory,
  subscribeUserMemories,
  subscribeUserProfile,
  subscribeUserSessions,
  subscribeUserTasks,
  toggleFirestoreTask,
  touchUserLastActive,
} from './lib/firebase';
import {
  clearHistoryStorage,
  loadHistory,
  loadLastActiveAt,
  loadMemories,
  loadSessions,
  loadSettings,
  loadTasks,
  saveHistory,
  saveLastActiveAt,
  saveMemories,
  saveSessions,
  saveSettings,
  saveTasks,
} from './utils/storage';
import {
  clearVrmFromIndexedDb,
  DEFAULT_BUILTIN_VRM_URL,
  loadVrmFromIndexedDb,
  saveVrmToIndexedDb,
} from './utils/vrmStorage';
import {
  getSpeechRecognitionCtor,
  SpeechRecognitionInstance,
  stripMarkdownForSpeech,
} from './utils/speech';
import {
  matchesPhraseList,
  matchesStandalonePhraseList,
  parseVoicePhraseList,
  playShutdownChime,
  playWakeAuthChime,
  unlockAudioPlayback,
} from './utils/wakeWord';
import { detectEmotionFromTranscript } from './utils/emotion';
import { GeminiLiveClient } from './utils/liveAudio';
import {
  buildDynamicWakeTrigger,
  getEmotionForMoodSeed,
  pickNextMoodSeed,
} from './utils/wakeContext';

const EMPTY_LIP_SYNC: LipSyncWeights = {
  amplitude: 0,
  aa: 0,
  ih: 0,
  ou: 0,
  ee: 0,
  oh: 0,
};

const STANDBY_CAPTION =
  'Standby mode active • Speak your secret voice code to wake Tampi';

const SETUP_REQUIRED_CAPTION =
  'Voice codes not set • Open Voice Commands to set your private Wake & Shutdown codes';

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getLocalDateTimeLabel(): string {
  return new Date().toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getUserDisplayName(currentUser: User | null): string {
  if (!currentUser) return 'Friend';
  const name = currentUser.displayName?.trim();
  if (name) return name;
  if (currentUser.email) return currentUser.email.split('@')[0] || 'Friend';
  return 'Friend';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [settings, setSettings] = useState<TampiSettings>(() =>
    loadSettings('guest'),
  );
  const [memories, setMemories] = useState<MemoryItem[]>(() =>
    loadMemories('guest'),
  );
  const [tasks, setTasks] = useState<StudyTask[]>(() => loadTasks('guest'));
  const [sessions, setSessions] = useState<StudySessionRecord[]>(() =>
    loadSessions('guest'),
  );
  const [history, setHistory] = useState<ChatTurn[]>(() => loadHistory('guest'));

  const [vrmUrl, setVrmUrl] = useState<string>(DEFAULT_BUILTIN_VRM_URL);
  const [vrmMetadata, setVrmMetadata] = useState<VrmMetadata | null>(null);
  const [vrmResolving, setVrmResolving] = useState(true);
  const [vrmUploading, setVrmUploading] = useState(false);

  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [avatarEmotion, setAvatarEmotion] = useState<AvatarEmotion>('neutral');
  const [captionText, setCaptionText] = useState<string>(STANDBY_CAPTION);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [voiceCommandsOpen, setVoiceCommandsOpen] = useState(false);
  const [voiceSetupReady, setVoiceSetupReady] = useState(false);
  const [needsVoiceCodeSetup, setNeedsVoiceCodeSetup] = useState(() => {
    const initial = loadSettings('guest');
    return (
      parseVoicePhraseList(initial.secretWakePhrase).length === 0 ||
      parseVoicePhraseList(initial.secretShutdownPhrase).length === 0
    );
  });
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [miniWidget, setMiniWidget] = useState(false);

  const [liveConnected, setLiveConnected] = useState(false);
  const [liveMuted, setLiveMuted] = useState(false);
  const [standbyListening, setStandbyListening] = useState(false);
  const [standbyAudioDetected, setStandbyAudioDetected] = useState(false);
  const [standbyHeardText, setStandbyHeardText] = useState('');
  const [micPermissionNeeded, setMicPermissionNeeded] = useState(false);
  const [standbyRetryNonce, setStandbyRetryNonce] = useState(0);
  const [wakeHudVisible, setWakeHudVisible] = useState(false);
  const [wakePulseKey, setWakePulseKey] = useState(0);
  const [wakeSequenceActive, setWakeSequenceActive] = useState(false);
  const [bootSequenceActive, setBootSequenceActive] = useState(false);
  const [sleepHudVisible, setSleepHudVisible] = useState(false);
  const [sleepPulseKey, setSleepPulseKey] = useState(0);
  const [sleepSequenceActive, setSleepSequenceActive] = useState(false);

  const [timer, setTimer] = useState<StudyTimerState>({
    active: false,
    paused: false,
    label: 'Study Focus',
    totalSeconds: 1500,
    remainingSeconds: 1500,
  });

  // Mutable refs for async Live callbacks & strict per-UID isolation
  const userRef = useRef<User | null>(null);
  const scopeKeyRef = useRef<string>('guest');
  const userNameRef = useRef<string>('Friend');
  const settingsRef = useRef(settings);
  const wakePhrasesRef = useRef<string[]>(
    parseVoicePhraseList(settings.secretWakePhrase),
  );
  const shutdownPhrasesRef = useRef<string[]>(
    parseVoicePhraseList(settings.secretShutdownPhrase),
  );
  const memoriesRef = useRef(memories);
  const tasksRef = useRef(tasks);
  const historyRef = useRef(history);
  const liveClientRef = useRef<GeminiLiveClient | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const emotionDecayTimerRef = useRef<number | null>(null);
  const wakeHudTimerRef = useRef<number | null>(null);
  const wakeConnectTimerRef = useRef<number | null>(null);
  const bootTimerRef = useRef<number | null>(null);
  const sleepHudTimerRef = useRef<number | null>(null);
  const sleepResumeTimerRef = useRef<number | null>(null);
  const standbyHeardTimerRef = useRef<number | null>(null);
  const standbyAudioDotTimerRef = useRef<number | null>(null);
  const wakePendingGreetingRef = useRef(false);
  const lastMoodSeedRef = useRef<WakeMoodSeed | null>(null);
  const activeWakeMoodRef = useRef<WakeMoodSeed | null>(null);
  const lastActiveBeforeWakeRef = useRef<string | null>(null);
  const sleepSequenceActiveRef = useRef(false);
  const triggerSleepSequenceRef = useRef<() => void>(() => {});
  const shutdownDebounceTimerRef = useRef<number | null>(null);
  const lastInputTranscriptAtRef = useRef<number>(0);
  const standbyManuallyMutedRef = useRef(false);
  const activeVrmBlobRef = useRef<string>('');
  const liveOutputBufferRef = useRef('');
  const liveInputBufferRef = useRef('');

  const scopeKey = user?.uid ?? 'guest';
  const userDisplayName = getUserDisplayName(user);
  const userFirstName = userDisplayName.split(/\s+/)[0] || 'Friend';

  useEffect(() => {
    userNameRef.current = userDisplayName;
  }, [userDisplayName]);

  useEffect(() => {
    settingsRef.current = settings;
    wakePhrasesRef.current = parseVoicePhraseList(settings.secretWakePhrase);
    shutdownPhrasesRef.current = parseVoicePhraseList(
      settings.secretShutdownPhrase,
    );
    if (scopeKeyRef.current === scopeKey) {
      saveSettings(settings, scopeKey);
    }
  }, [settings, scopeKey]);

  useEffect(() => {
    memoriesRef.current = memories;
    if (scopeKeyRef.current === scopeKey) {
      saveMemories(memories, scopeKey);
    }
  }, [memories, scopeKey]);

  useEffect(() => {
    tasksRef.current = tasks;
    if (scopeKeyRef.current === scopeKey) {
      saveTasks(tasks, scopeKey);
    }
  }, [tasks, scopeKey]);

  useEffect(() => {
    if (scopeKeyRef.current === scopeKey) {
      saveSessions(sessions, scopeKey);
    }
  }, [sessions, scopeKey]);

  useEffect(() => {
    historyRef.current = history;
    if (scopeKeyRef.current === scopeKey) {
      saveHistory(history, scopeKey);
    }
  }, [history, scopeKey]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3800);
  }, []);

  // Use permanent built-in /tampi.vrm by default; only load IndexedDB if user explicitly uploaded a custom .vrm in Settings
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const loaded = await loadVrmFromIndexedDb();
        if (!active) return;
        if (loaded) {
          activeVrmBlobRef.current = loaded.blobUrl;
          setVrmUrl(loaded.blobUrl);
          setVrmMetadata(loaded.metadata);
          return;
        }
        setVrmUrl(DEFAULT_BUILTIN_VRM_URL);
        setVrmMetadata(null);
      } catch {
        if (active) {
          setVrmUrl(DEFAULT_BUILTIN_VRM_URL);
          setVrmMetadata(null);
        }
      } finally {
        if (active) {
          setVrmResolving(false);
        }
      }
    })();

    return () => {
      active = false;
      if (activeVrmBlobRef.current) {
        URL.revokeObjectURL(activeVrmBlobRef.current);
        activeVrmBlobRef.current = '';
      }
    };
  }, []);

  const handleUploadVrm = useCallback(
    async (file: File) => {
      setVrmUploading(true);
      try {
        const saved = await saveVrmToIndexedDb(file);
        if (activeVrmBlobRef.current) {
          URL.revokeObjectURL(activeVrmBlobRef.current);
        }
        activeVrmBlobRef.current = saved.blobUrl;
        setVrmUrl(saved.blobUrl);
        setVrmMetadata(saved.metadata);
        showToast(`Loaded custom avatar: ${saved.metadata.name}`);
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'Could not store .vrm file in IndexedDB.',
        );
      } finally {
        setVrmUploading(false);
      }
    },
    [showToast],
  );

  const handleClearVrm = useCallback(async () => {
    try {
      await clearVrmFromIndexedDb();
    } catch {
      // ignore
    }
    if (activeVrmBlobRef.current) {
      URL.revokeObjectURL(activeVrmBlobRef.current);
      activeVrmBlobRef.current = '';
    }
    setVrmUrl(DEFAULT_BUILTIN_VRM_URL);
    setVrmMetadata(null);
    showToast('Restored built-in Tampi avatar');
  }, [showToast]);

  const profileSyncTimerRef = useRef<number | null>(null);

  const updateSettings = useCallback(
    (
      updater:
        | Partial<TampiSettings>
        | ((prev: TampiSettings) => TampiSettings),
    ) => {
      if (
        typeof updater === 'object' &&
        typeof updater.customGlbUrl === 'string' &&
        updater.customGlbUrl.trim()
      ) {
        void clearVrmFromIndexedDb().catch(() => {});
        if (activeVrmBlobRef.current) {
          URL.revokeObjectURL(activeVrmBlobRef.current);
          activeVrmBlobRef.current = '';
        }
        setVrmMetadata(null);
        setVrmUrl(DEFAULT_BUILTIN_VRM_URL);
      }

      setSettings((prev) => {
        const rawNext =
          typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
        const wakeList = parseVoicePhraseList(rawNext.secretWakePhrase);
        const shutdownList = parseVoicePhraseList(rawNext.secretShutdownPhrase);
        const configured = wakeList.length > 0 && shutdownList.length > 0;
        const next: TampiSettings = {
          ...rawNext,
          voiceCodesConfigured: configured,
        };

        settingsRef.current = next;
        wakePhrasesRef.current = wakeList;
        shutdownPhrasesRef.current = shutdownList;
        saveSettings(next, scopeKeyRef.current);
        setNeedsVoiceCodeSetup(!configured);

        const activeUser = userRef.current;
        if (activeUser) {
          if (profileSyncTimerRef.current) {
            window.clearTimeout(profileSyncTimerRef.current);
          }
          const targetUid = activeUser.uid;
          profileSyncTimerRef.current = window.setTimeout(() => {
            profileSyncTimerRef.current = null;
            if (userRef.current?.uid !== targetUid) return;
            void ensureAndSyncUserProfile(userRef.current, next, true).catch(
              (err) => {
                showToast(
                  err instanceof Error
                    ? err.message
                    : 'Failed to sync preferences.',
                );
              },
            );
          }, 350);
        }
        return next;
      });
    },
    [showToast],
  );

  // Firebase Auth + Firestore profile, secret phrases (users/{uid}/settings), memories, tasks, sessions & chat history isolation
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let unsubMemories: (() => void) | null = null;
    let unsubHistory: (() => void) | null = null;
    let unsubTasks: (() => void) | null = null;
    let unsubSessions: (() => void) | null = null;
    let cancelled = false;

    const cleanupListeners = () => {
      unsubProfile?.();
      unsubProfile = null;
      unsubMemories?.();
      unsubMemories = null;
      unsubHistory?.();
      unsubHistory = null;
      unsubTasks?.();
      unsubTasks = null;
      unsubSessions?.();
      unsubSessions = null;
    };

    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      cleanupListeners();

      const nextScope = currentUser?.uid ?? 'guest';
      const scopeChanged = scopeKeyRef.current !== nextScope;
      scopeKeyRef.current = nextScope;
      userRef.current = currentUser;
      userNameRef.current = getUserDisplayName(currentUser);
      setUser(currentUser);

      if (scopeChanged) {
        liveClientRef.current?.disconnect();
        liveClientRef.current = null;
        liveInputBufferRef.current = '';
        liveOutputBufferRef.current = '';
        setLiveConnected(false);
        setLiveMuted(false);
        setInterimTranscript('');
        setAssistantState('idle');
      }

      const scopedSettings = loadSettings(nextScope);
      const scopedMemories = loadMemories(nextScope);
      const scopedTasks = loadTasks(nextScope);
      const scopedSessions = loadSessions(nextScope);
      const scopedHistory = loadHistory(nextScope);

      const scopedWakeList = parseVoicePhraseList(
        scopedSettings.secretWakePhrase,
      );
      const scopedShutdownList = parseVoicePhraseList(
        scopedSettings.secretShutdownPhrase,
      );
      const scopedConfigured =
        Boolean(scopedSettings.voiceCodesConfigured) &&
        scopedWakeList.length > 0 &&
        scopedShutdownList.length > 0;

      settingsRef.current = scopedSettings;
      wakePhrasesRef.current = scopedWakeList;
      shutdownPhrasesRef.current = scopedShutdownList;
      memoriesRef.current = scopedMemories;
      tasksRef.current = scopedTasks;
      historyRef.current = scopedHistory;

      setSettings(scopedSettings);
      setMemories(scopedMemories);
      setTasks(scopedTasks);
      setSessions(scopedSessions);
      setHistory(scopedHistory);

      if (!currentUser) {
        setNeedsVoiceCodeSetup(!scopedConfigured);
        setCaptionText(
          scopedConfigured ? STANDBY_CAPTION : SETUP_REQUIRED_CAPTION,
        );
        setVoiceSetupReady(true);
        setAuthLoading(false);
        return;
      }

      setVoiceSetupReady(scopedConfigured);
      if (scopedConfigured) {
        setNeedsVoiceCodeSetup(false);
        setCaptionText(STANDBY_CAPTION);
      }
      setAuthLoading(false);

      try {
        const syncResult = await ensureAndSyncUserProfile(
          currentUser,
          scopedSettings,
          false,
        );
        if (cancelled || userRef.current?.uid !== currentUser.uid) return;

        const mergedSettings: TampiSettings = {
          ...scopedSettings,
          ...syncResult.settingsPatch,
          liveVoiceName:
            syncResult.settingsPatch.liveVoiceName ||
            scopedSettings.liveVoiceName ||
            defaultVoice,
          standbyWakeEnabled: standbyManuallyMutedRef.current
            ? scopedSettings.standbyWakeEnabled
            : true,
          personaInstructions: syncResult.settingsPatch.personaInstructions
            ? migratePersonaIfLegacyDefault(
                syncResult.settingsPatch.personaInstructions,
              )
            : scopedSettings.personaInstructions,
          voiceCodesConfigured: syncResult.voiceCodesConfigured,
          voiceMode: 'live',
        };

        const activeWakeList = parseVoicePhraseList(
          mergedSettings.secretWakePhrase,
        );
        const activeShutdownList = parseVoicePhraseList(
          mergedSettings.secretShutdownPhrase,
        );
        const isConfigured =
          syncResult.voiceCodesConfigured &&
          activeWakeList.length > 0 &&
          activeShutdownList.length > 0;

        settingsRef.current = mergedSettings;
        wakePhrasesRef.current = activeWakeList;
        shutdownPhrasesRef.current = activeShutdownList;
        saveSettings(mergedSettings, currentUser.uid);
        setSettings(mergedSettings);
        setNeedsVoiceCodeSetup(!isConfigured);

        if (!isConfigured) {
          setCaptionText(SETUP_REQUIRED_CAPTION);
          setVoiceCommandsOpen(true);
        } else {
          setCaptionText(STANDBY_CAPTION);
        }
        setVoiceSetupReady(true);

        unsubProfile = subscribeUserProfile(
          currentUser.uid,
          (patch) => {
            setSettings((prev) => {
              const next: TampiSettings = {
                ...prev,
                ...patch,
                liveVoiceName:
                  patch.liveVoiceName || prev.liveVoiceName || defaultVoice,
                standbyWakeEnabled: standbyManuallyMutedRef.current
                  ? prev.standbyWakeEnabled
                  : true,
                personaInstructions: patch.personaInstructions
                  ? migratePersonaIfLegacyDefault(patch.personaInstructions)
                  : prev.personaInstructions,
                voiceMode: 'live',
              };
              const wakeList = parseVoicePhraseList(next.secretWakePhrase);
              const shutdownList = parseVoicePhraseList(
                next.secretShutdownPhrase,
              );
              const configured =
                Boolean(next.voiceCodesConfigured ?? (wakeList.length > 0 && shutdownList.length > 0)) &&
                wakeList.length > 0 &&
                shutdownList.length > 0;
              next.voiceCodesConfigured = configured;

              settingsRef.current = next;
              wakePhrasesRef.current = wakeList;
              shutdownPhrasesRef.current = shutdownList;
              if (scopeKeyRef.current === currentUser.uid) {
                saveSettings(next, currentUser.uid);
              }
              setNeedsVoiceCodeSetup(!configured);
              return next;
            });
          },
          (err) => showToast(err.message),
        );

        unsubMemories = subscribeUserMemories(
          currentUser.uid,
          (items) => {
            setMemories(items);
          },
          (err) => showToast(err.message),
        );

        unsubHistory = subscribeUserHistory(
          currentUser.uid,
          (turns) => {
            setHistory(turns);
          },
          (err) => showToast(err.message),
        );

        unsubTasks = subscribeUserTasks(
          currentUser.uid,
          (items) => {
            setTasks(items);
          },
          (err) => showToast(err.message),
        );

        unsubSessions = subscribeUserSessions(
          currentUser.uid,
          (items) => {
            setSessions(items);
          },
          (err) => showToast(err.message),
        );
      } catch (err) {
        if (!cancelled) {
          setVoiceSetupReady(true);
          showToast(
            err instanceof Error
              ? err.message
              : 'Failed to sync Firestore profile.',
          );
        }
      }
    });

    return () => {
      cancelled = true;
      cleanupListeners();
      unsubAuth();
    };
  }, [showToast]);

  const handleSignIn = useCallback(async () => {
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
      showToast('Signed in with Google');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to sign in right now.';
      if (!msg.includes('popup-closed-by-user')) {
        showToast(msg);
      }
    } finally {
      setAuthLoading(false);
    }
  }, [showToast]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      showToast('Signed out');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to sign out.');
    }
  }, [showToast]);

  const appendTurn = useCallback(
    (role: 'user' | 'model', text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const nowIso = new Date().toISOString();
      const newTurn: ChatTurn = {
        id: makeId(role),
        role,
        text: clean,
        timestamp: nowIso,
      };
      setHistory((prev) => [...prev, newTurn].slice(-30));
      saveLastActiveAt(nowIso, scopeKeyRef.current);

      const activeUser = userRef.current;
      if (activeUser) {
        void addFirestoreHistoryTurn(activeUser.uid, newTurn).catch((err) => {
          showToast(
            err instanceof Error ? err.message : 'Failed to save chat turn.',
          );
        });
        void touchUserLastActive(activeUser.uid, nowIso);
      }
    },
    [showToast],
  );

  const stopSpeaking = useCallback(() => {
    liveClientRef.current?.flushPlayback();
    setAssistantState((prev) =>
      prev === 'speaking' ? (liveConnected ? 'listening' : 'idle') : prev,
    );
  }, [liveConnected]);

  // Study Timer Tick Effect
  useEffect(() => {
    if (!timer.active || timer.paused) return;

    const intervalId = window.setInterval(() => {
      setTimer((prev) => {
        if (!prev.active || prev.paused) return prev;
        if (prev.remainingSeconds <= 1) {
          return {
            ...prev,
            active: false,
            paused: false,
            remainingSeconds: 0,
          };
        }
        return {
          ...prev,
          remainingSeconds: prev.remainingSeconds - 1,
        };
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [timer.active, timer.paused]);

  const handleAddMemory = useCallback(
    async (category: MemoryItem['category'], content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (
        memoriesRef.current.some(
          (m) => m.content.toLowerCase() === trimmed.toLowerCase(),
        )
      ) {
        return;
      }

      const activeUser = userRef.current;
      if (activeUser) {
        try {
          await addFirestoreMemory(activeUser.uid, category, trimmed);
        } catch (err) {
          showToast(
            err instanceof Error ? err.message : 'Failed to save memory.',
          );
        }
      } else {
        setMemories((prev) => [
          {
            id: makeId('mem'),
            category,
            content: trimmed,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    },
    [showToast],
  );

  const handleDeleteMemory = useCallback(
    async (id: string) => {
      const activeUser = userRef.current;
      if (activeUser) {
        try {
          await deleteFirestoreMemory(activeUser.uid, id);
        } catch (err) {
          showToast(
            err instanceof Error ? err.message : 'Failed to delete memory.',
          );
        }
      } else {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    },
    [showToast],
  );

  const handleAddTask = useCallback(
    (title: string, subject?: string, dueLabel?: string) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) return;
      const newTask: StudyTask = {
        id: makeId('task'),
        title: cleanTitle,
        subject: subject?.trim() || undefined,
        dueLabel: dueLabel?.trim() || undefined,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      const activeUser = userRef.current;
      if (activeUser) {
        void addFirestoreTask(activeUser.uid, newTask).catch((err) => {
          showToast(
            err instanceof Error ? err.message : 'Failed to save task.',
          );
        });
      } else {
        setTasks((prev) => [newTask, ...prev]);
      }
    },
    [showToast],
  );

  const handleToggleTask = useCallback(
    (id: string) => {
      const target = tasksRef.current.find((t) => t.id === id);
      if (!target) return;
      const nextCompleted = !target.completed;
      const activeUser = userRef.current;
      if (activeUser) {
        void toggleFirestoreTask(activeUser.uid, id, nextCompleted).catch(
          (err) => {
            showToast(
              err instanceof Error ? err.message : 'Failed to update task.',
            );
          },
        );
      } else {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, completed: nextCompleted } : t,
          ),
        );
      }
    },
    [showToast],
  );

  const handleDeleteTask = useCallback(
    (id: string) => {
      const activeUser = userRef.current;
      if (activeUser) {
        void deleteFirestoreTask(activeUser.uid, id).catch((err) => {
          showToast(
            err instanceof Error ? err.message : 'Failed to delete task.',
          );
        });
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== id));
      }
    },
    [showToast],
  );

  const handleClearHistory = useCallback(() => {
    clearHistoryStorage(scopeKeyRef.current);
    setHistory([]);
    const activeUser = userRef.current;
    if (activeUser) {
      void clearFirestoreHistory(activeUser.uid).catch((err) => {
        showToast(
          err instanceof Error ? err.message : 'Failed to clear cloud history.',
        );
      });
    }
    showToast('Conversation history cleared');
  }, [showToast]);

  // Log completed study sprint & cue Live session if connected
  const prevTimerActiveRef = useRef(timer.active);
  useEffect(() => {
    if (
      prevTimerActiveRef.current &&
      !timer.active &&
      timer.remainingSeconds === 0
    ) {
      const durationMinutes = Math.max(1, Math.round(timer.totalSeconds / 60));
      const newSession: StudySessionRecord = {
        id: makeId('sess'),
        label: timer.label,
        durationMinutes,
        completedAt: new Date().toISOString(),
      };
      const activeUser = userRef.current;
      if (activeUser) {
        void addFirestoreSession(activeUser.uid, newSession).catch((err) => {
          showToast(
            err instanceof Error ? err.message : 'Failed to log session.',
          );
        });
      } else {
        setSessions((prev) => [newSession, ...prev]);
      }
      const firstName = userNameRef.current.split(/\s+/)[0] || 'there';
      const msg = `Hey ${firstName}, your ${timer.label} timer is up! Take a quick breather before the next sprint.`;
      setCaptionText(msg);
      showToast(`${timer.label} complete!`);
      if (liveClientRef.current) {
        liveClientRef.current.sendText(
          `My ${timer.label} study timer just finished. Tease or congratulate me warmly in your style and remind me to take a short break.`,
        );
      }
    }
    prevTimerActiveRef.current = timer.active;
  }, [
    timer.active,
    timer.remainingSeconds,
    timer.label,
    timer.totalSeconds,
    showToast,
  ]);

  const applyStructuredAction = useCallback(
    (action: StructuredAction) => {
      if (action.type === 'save_memory' && action.content?.trim()) {
        void handleAddMemory(action.category || 'note', action.content.trim());
        showToast('Saved to Personal Memory');
      } else if (action.type === 'add_task' && action.title?.trim()) {
        handleAddTask(action.title.trim(), action.subject, action.dueLabel);
        showToast(`Added study task: ${action.title.trim()}`);
      } else if (action.type === 'complete_task' && action.titleMatch?.trim()) {
        const needle = action.titleMatch.toLowerCase();
        const target = tasksRef.current.find(
          (t) => !t.completed && t.title.toLowerCase().includes(needle),
        );
        if (target) {
          handleToggleTask(target.id);
        }
        showToast('Updated study task');
      } else if (action.type === 'start_timer') {
        const mins = Math.max(
          1,
          Math.min(180, Math.round(action.minutes || 25)),
        );
        const secs = mins * 60;
        const label = action.label?.trim() || 'Study Focus';
        setTimer({
          active: true,
          paused: false,
          label,
          totalSeconds: secs,
          remainingSeconds: secs,
        });
        showToast(`Started ${mins}m ${label} timer`);
      } else if (action.type === 'stop_timer') {
        setTimer((prev) => ({
          ...prev,
          active: false,
          paused: false,
          remainingSeconds: prev.totalSeconds,
        }));
        showToast('Study timer stopped');
      }
    },
    [handleAddMemory, handleAddTask, handleToggleTask, showToast],
  );

  const scheduleEmotionDecay = useCallback(() => {
    if (emotionDecayTimerRef.current) {
      window.clearTimeout(emotionDecayTimerRef.current);
    }
    emotionDecayTimerRef.current = window.setTimeout(() => {
      setAvatarEmotion('neutral');
    }, 3800);
  }, []);

  const disconnectLive = useCallback(() => {
    if (shutdownDebounceTimerRef.current) {
      window.clearTimeout(shutdownDebounceTimerRef.current);
      shutdownDebounceTimerRef.current = null;
    }
    liveClientRef.current?.disconnect();
    liveClientRef.current = null;
    liveInputBufferRef.current = '';
    liveOutputBufferRef.current = '';
    lastInputTranscriptAtRef.current = 0;
    if (emotionDecayTimerRef.current) {
      window.clearTimeout(emotionDecayTimerRef.current);
      emotionDecayTimerRef.current = null;
    }
    setLiveConnected(false);
    setLiveMuted(false);
    setInterimTranscript('');
    setAvatarEmotion('neutral');
    setAssistantState('idle');
  }, []);

  const connectLive = useCallback(async () => {
    const client = new GeminiLiveClient({
      onReady: () => {
        setLiveConnected(true);
        setLiveMuted(false);
        const wakeMood =
          activeWakeMoodRef.current ?? pickNextMoodSeed(lastMoodSeedRef.current);
        setAvatarEmotion(getEmotionForMoodSeed(wakeMood));
        scheduleEmotionDecay();
        setAssistantState('listening');
        if (wakePendingGreetingRef.current) {
          wakePendingGreetingRef.current = false;
          const dynamicTrigger = buildDynamicWakeTrigger({
            userName: userNameRef.current,
            language: settingsRef.current.language,
            memories: memoriesRef.current,
            history: historyRef.current,
            lastActiveAt: lastActiveBeforeWakeRef.current,
            moodSeed: wakeMood,
          });
          client.sendText(dynamicTrigger);
        } else {
          showToast('Live call connected with Tampi');
        }
      },
      onInputTranscript: (text) => {
        const now = Date.now();
        if (
          lastInputTranscriptAtRef.current > 0 &&
          now - lastInputTranscriptAtRef.current > 4000 &&
          liveInputBufferRef.current.trim()
        ) {
          liveInputBufferRef.current = '';
        }
        lastInputTranscriptAtRef.current = now;

        liveInputBufferRef.current += text;
        const buffered = liveInputBufferRef.current.trim();
        setInterimTranscript(buffered);

        if (shutdownDebounceTimerRef.current) {
          window.clearTimeout(shutdownDebounceTimerRef.current);
          shutdownDebounceTimerRef.current = null;
        }

        if (
          !sleepSequenceActiveRef.current &&
          matchesStandalonePhraseList(buffered, shutdownPhrasesRef.current)
        ) {
          shutdownDebounceTimerRef.current = window.setTimeout(() => {
            shutdownDebounceTimerRef.current = null;
            if (
              !sleepSequenceActiveRef.current &&
              matchesStandalonePhraseList(
                liveInputBufferRef.current.trim(),
                shutdownPhrasesRef.current,
              )
            ) {
              triggerSleepSequenceRef.current();
            }
          }, 480);
        }
      },
      onOutputTranscript: (text) => {
        const pendingInput = liveInputBufferRef.current.trim();
        if (
          shutdownDebounceTimerRef.current &&
          pendingInput &&
          !sleepSequenceActiveRef.current &&
          matchesStandalonePhraseList(pendingInput, shutdownPhrasesRef.current)
        ) {
          window.clearTimeout(shutdownDebounceTimerRef.current);
          shutdownDebounceTimerRef.current = null;
          triggerSleepSequenceRef.current();
          return;
        }
        if (shutdownDebounceTimerRef.current) {
          window.clearTimeout(shutdownDebounceTimerRef.current);
          shutdownDebounceTimerRef.current = null;
        }

        if (pendingInput) {
          appendTurn('user', pendingInput);
          liveInputBufferRef.current = '';
          setInterimTranscript('');
        }
        liveOutputBufferRef.current += ` ${text}`;
        const fullOut = liveOutputBufferRef.current.trim();
        setCaptionText(fullOut);

        const amp = liveClientRef.current?.getLipSyncWeights().amplitude ?? 0;
        const detected = detectEmotionFromTranscript(fullOut, amp);
        if (detected !== 'neutral') {
          if (emotionDecayTimerRef.current) {
            window.clearTimeout(emotionDecayTimerRef.current);
            emotionDecayTimerRef.current = null;
          }
          setAvatarEmotion(detected);
        }
      },
      onSpeakingChange: (speaking) => {
        if (speaking) {
          const pendingInput = liveInputBufferRef.current.trim();
          if (
            shutdownDebounceTimerRef.current &&
            pendingInput &&
            !sleepSequenceActiveRef.current &&
            matchesStandalonePhraseList(pendingInput, shutdownPhrasesRef.current)
          ) {
            window.clearTimeout(shutdownDebounceTimerRef.current);
            shutdownDebounceTimerRef.current = null;
            triggerSleepSequenceRef.current();
            return;
          }
          if (emotionDecayTimerRef.current) {
            window.clearTimeout(emotionDecayTimerRef.current);
            emotionDecayTimerRef.current = null;
          }
          setAssistantState('speaking');
        } else {
          if (liveInputBufferRef.current.trim()) {
            appendTurn('user', liveInputBufferRef.current.trim());
            liveInputBufferRef.current = '';
            setInterimTranscript('');
          }
          if (liveOutputBufferRef.current.trim()) {
            const finalTurn = liveOutputBufferRef.current.trim();
            const detected = detectEmotionFromTranscript(finalTurn);
            if (detected !== 'neutral') {
              setAvatarEmotion(detected);
            }
            appendTurn('model', finalTurn);
            liveOutputBufferRef.current = '';
          }
          scheduleEmotionDecay();
          setAssistantState((prev) =>
            prev === 'speaking' ? 'listening' : prev,
          );
        }
      },
      onAction: applyStructuredAction,
      onError: (msg) => {
        showToast(msg);
        disconnectLive();
      },
      onClosed: () => {
        setLiveConnected(false);
        setLiveMuted(false);
        setAvatarEmotion('neutral');
        setAssistantState('idle');
      },
    });

    liveClientRef.current = client;
    setAssistantState('thinking');

    try {
      await client.connect({
        userName: userNameRef.current,
        persona: settingsRef.current.personaInstructions,
        memories: memoriesRef.current,
        tasks: tasksRef.current,
        localDateTime: getLocalDateTimeLabel(),
        language: settingsRef.current.language,
        voiceName: settingsRef.current.liveVoiceName || defaultVoice,
        history: historyRef.current,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not start Live audio connection.';
      showToast(message);
      disconnectLive();
    }
  }, [appendTurn, applyStructuredAction, disconnectLive, scheduleEmotionDecay, showToast]);

  // Unlock Web Audio playback on first user interaction anywhere in the window
  useEffect(() => {
    const unlockOnce = () => {
      unlockAudioPlayback();
    };
    window.addEventListener('pointerdown', unlockOnce, { once: true, passive: true });
    window.addEventListener('keydown', unlockOnce, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, []);

  useEffect(() => {
    return () => {
      disconnectLive();
      if (shutdownDebounceTimerRef.current) window.clearTimeout(shutdownDebounceTimerRef.current);
      if (wakeHudTimerRef.current) window.clearTimeout(wakeHudTimerRef.current);
      if (wakeConnectTimerRef.current) window.clearTimeout(wakeConnectTimerRef.current);
      if (bootTimerRef.current) window.clearTimeout(bootTimerRef.current);
      if (sleepHudTimerRef.current) window.clearTimeout(sleepHudTimerRef.current);
      if (sleepResumeTimerRef.current) window.clearTimeout(sleepResumeTimerRef.current);
    };
  }, [disconnectLive]);

  const triggerWakeSequence = useCallback(() => {
    if (sleepResumeTimerRef.current) {
      window.clearTimeout(sleepResumeTimerRef.current);
      sleepResumeTimerRef.current = null;
    }
    sleepSequenceActiveRef.current = false;
    setSleepSequenceActive(false);
    setSleepHudVisible(false);

    // Snapshot previous activity timestamp BEFORE updating lastActiveAt for accurate absence detection
    lastActiveBeforeWakeRef.current =
      settingsRef.current.lastActiveAt ||
      loadLastActiveAt(scopeKeyRef.current);

    const nowIso = new Date().toISOString();
    saveLastActiveAt(nowIso, scopeKeyRef.current);
    settingsRef.current = { ...settingsRef.current, lastActiveAt: nowIso };
    if (userRef.current) {
      void touchUserLastActive(userRef.current.uid, nowIso);
    }

    const moodSeed = pickNextMoodSeed(lastMoodSeedRef.current);
    lastMoodSeedRef.current = moodSeed;
    activeWakeMoodRef.current = moodSeed;

    if (standbyHeardTimerRef.current) {
      window.clearTimeout(standbyHeardTimerRef.current);
      standbyHeardTimerRef.current = null;
    }
    if (standbyAudioDotTimerRef.current) {
      window.clearTimeout(standbyAudioDotTimerRef.current);
      standbyAudioDotTimerRef.current = null;
    }
    setStandbyHeardText('');
    setStandbyAudioDetected(false);

    setWakeSequenceActive(true);
    setBootSequenceActive(true);
    setStandbyListening(false);
    playWakeAuthChime();
    setWakeHudVisible(true);
    setWakePulseKey((k) => k + 1);
    setAvatarEmotion(getEmotionForMoodSeed(moodSeed));
    scheduleEmotionDecay();

    if (bootTimerRef.current) {
      window.clearTimeout(bootTimerRef.current);
    }
    bootTimerRef.current = window.setTimeout(() => {
      bootTimerRef.current = null;
      setBootSequenceActive(false);
    }, 1500);

    if (wakeHudTimerRef.current) {
      window.clearTimeout(wakeHudTimerRef.current);
    }
    wakeHudTimerRef.current = window.setTimeout(() => {
      setWakeHudVisible(false);
    }, 2800);

    if (wakeConnectTimerRef.current) {
      window.clearTimeout(wakeConnectTimerRef.current);
    }
    wakePendingGreetingRef.current = true;
    wakeConnectTimerRef.current = window.setTimeout(() => {
      setWakeSequenceActive(false);
      void connectLive();
    }, 620);
  }, [connectLive, scheduleEmotionDecay]);

  const triggerSleepSequence = useCallback(() => {
    if (sleepSequenceActiveRef.current) return;
    sleepSequenceActiveRef.current = true;
    setSleepSequenceActive(true);
    standbyManuallyMutedRef.current = false;
    setMicPermissionNeeded(false);

    if (shutdownDebounceTimerRef.current) {
      window.clearTimeout(shutdownDebounceTimerRef.current);
      shutdownDebounceTimerRef.current = null;
    }

    const nowIso = new Date().toISOString();
    const wasStandbyMuted = !settingsRef.current.standbyWakeEnabled;
    saveLastActiveAt(nowIso, scopeKeyRef.current);
    settingsRef.current = {
      ...settingsRef.current,
      lastActiveAt: nowIso,
      standbyWakeEnabled: true,
    };
    if (wasStandbyMuted) {
      updateSettings({ standbyWakeEnabled: true });
    } else {
      setSettings((prev) =>
        prev.standbyWakeEnabled ? prev : { ...prev, standbyWakeEnabled: true },
      );
    }
    if (userRef.current) {
      void touchUserLastActive(userRef.current.uid, nowIso);
    }

    if (wakeHudTimerRef.current) {
      window.clearTimeout(wakeHudTimerRef.current);
      wakeHudTimerRef.current = null;
    }
    if (wakeConnectTimerRef.current) {
      window.clearTimeout(wakeConnectTimerRef.current);
      wakeConnectTimerRef.current = null;
    }
    if (bootTimerRef.current) {
      window.clearTimeout(bootTimerRef.current);
      bootTimerRef.current = null;
    }
    wakePendingGreetingRef.current = false;
    setWakeSequenceActive(false);
    setBootSequenceActive(false);
    setWakeHudVisible(false);

    playShutdownChime();
    setSleepHudVisible(true);
    setSleepPulseKey((k) => k + 1);
    setCaptionText(STANDBY_CAPTION);

    disconnectLive();

    if (sleepHudTimerRef.current) {
      window.clearTimeout(sleepHudTimerRef.current);
    }
    sleepHudTimerRef.current = window.setTimeout(() => {
      setSleepHudVisible(false);
    }, 2800);

    if (sleepResumeTimerRef.current) {
      window.clearTimeout(sleepResumeTimerRef.current);
    }
    sleepResumeTimerRef.current = window.setTimeout(() => {
      sleepSequenceActiveRef.current = false;
      setSleepSequenceActive(false);
    }, 950);
  }, [disconnectLive, updateSettings]);

  useEffect(() => {
    triggerSleepSequenceRef.current = triggerSleepSequence;
  }, [triggerSleepSequence]);

  // Passive Standby Voice-Code Listener (Web Speech API, dynamic bn-BD / en-US + phonetic/fuzzy matching)
  // Automatically starts once the user's personal voice codes are configured, pauses during Live Call, and restarts cleanly on changes.
  useEffect(() => {
    const hasConfiguredWakePhrases =
      parseVoicePhraseList(settings.secretWakePhrase).length > 0;
    const shouldListen =
      !authLoading &&
      voiceSetupReady &&
      !needsVoiceCodeSetup &&
      !voiceCommandsOpen &&
      hasConfiguredWakePhrases &&
      settings.standbyWakeEnabled &&
      !liveConnected &&
      assistantState === 'idle' &&
      !wakeSequenceActive &&
      !sleepSequenceActive &&
      !micPermissionNeeded;

    if (!shouldListen) {
      setStandbyListening(false);
      setStandbyAudioDetected(false);
      setStandbyHeardText('');
      return;
    }

    const SpeechCtor = getSpeechRecognitionCtor();
    if (!SpeechCtor) {
      setStandbyListening(false);
      return;
    }

    let disposed = false;
    let recognition: SpeechRecognitionInstance | null = null;
    let restartTimer: number | null = null;
    let consecutiveStartFailures = 0;
    const activeLang: LanguageCode = settings.language;

    const pulseAudioDot = () => {
      if (disposed) return;
      setStandbyAudioDetected(true);
      if (standbyAudioDotTimerRef.current) {
        window.clearTimeout(standbyAudioDotTimerRef.current);
      }
      standbyAudioDotTimerRef.current = window.setTimeout(() => {
        standbyAudioDotTimerRef.current = null;
        setStandbyAudioDetected(false);
      }, 1400);
    };

    const showHeardPreview = (rawSnippet: string) => {
      if (disposed) return;
      const clean = rawSnippet.replace(/\s+/g, ' ').trim();
      if (!clean) return;
      setStandbyHeardText(clean.length > 48 ? `...${clean.slice(-45)}` : clean);
      if (standbyHeardTimerRef.current) {
        window.clearTimeout(standbyHeardTimerRef.current);
      }
      standbyHeardTimerRef.current = window.setTimeout(() => {
        standbyHeardTimerRef.current = null;
        setStandbyHeardText('');
      }, 2000);
    };

    const startListener = () => {
      if (disposed) return;
      try {
        recognition = new SpeechCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 5;
        recognition.lang = activeLang;

        recognition.onstart = () => {
          if (!disposed) {
            consecutiveStartFailures = 0;
            setStandbyListening(true);
            setMicPermissionNeeded(false);
          }
        };

        recognition.onsoundstart = () => {
          pulseAudioDot();
        };

        recognition.onspeechstart = () => {
          pulseAudioDot();
        };

        recognition.onresult = (event) => {
          if (disposed) return;
          pulseAudioDot();

          const activeWakePhrases = wakePhrasesRef.current;
          if (activeWakePhrases.length === 0) return;

          const latestResult = event.results[event.results.length - 1];
          const primaryHeard = latestResult?.[0]?.transcript?.trim();
          if (primaryHeard) {
            showHeardPreview(primaryHeard);
          }

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const altCount = Math.min(5, result?.length ?? 5);
            for (let alt = 0; alt < altCount; alt++) {
              const transcript = result?.[alt]?.transcript;
              if (!transcript) continue;
              if (alt === 0 && !primaryHeard) {
                showHeardPreview(transcript);
              }
              const prevTranscript =
                i > 0 ? event.results[i - 1]?.[alt]?.transcript ?? '' : '';
              const prev2Transcript =
                i > 1 ? event.results[i - 2]?.[alt]?.transcript ?? '' : '';
              const combined = [prev2Transcript, prevTranscript, transcript]
                .filter(Boolean)
                .join(' ');

              if (
                matchesPhraseList(transcript, activeWakePhrases) ||
                matchesPhraseList(combined, activeWakePhrases)
              ) {
                disposed = true;
                try {
                  recognition?.abort();
                } catch {
                  // ignore abort errors
                }
                triggerWakeSequence();
                return;
              }
            }
          }
        };

        recognition.onerror = (event) => {
          if (disposed) return;
          if (event.error === 'no-speech') {
            // Normal silence timeout — ignore and let onend perform the 300ms debounced restart
            return;
          }
          if (
            event.error === 'not-allowed' ||
            event.error === 'service-not-allowed'
          ) {
            disposed = true;
            setStandbyListening(false);
            setStandbyAudioDetected(false);
            setStandbyHeardText('');
            setMicPermissionNeeded(true);
          } else if (event.error === 'audio-capture') {
            consecutiveStartFailures += 1;
            if (consecutiveStartFailures >= 3) {
              disposed = true;
              setStandbyListening(false);
              setStandbyAudioDetected(false);
              setStandbyHeardText('');
              setMicPermissionNeeded(true);
            }
          } else if (event.error === 'aborted') {
            consecutiveStartFailures += 1;
            if (consecutiveStartFailures >= 5) {
              disposed = true;
              setStandbyListening(false);
              setStandbyAudioDetected(false);
              setStandbyHeardText('');
              setMicPermissionNeeded(true);
            }
          }
        };

        recognition.onend = () => {
          if (disposed) return;
          // Keep standbyListening steady during silent 300ms background restarts so UI never flickers
          if (restartTimer !== null) {
            window.clearTimeout(restartTimer);
          }
          const delay = consecutiveStartFailures > 0 ? 450 : 300;
          restartTimer = window.setTimeout(() => {
            restartTimer = null;
            if (!disposed) {
              startListener();
            }
          }, delay);
        };

        recognition.start();
      } catch (err) {
        const errName = err instanceof Error ? err.name : '';
        const errMsg = err instanceof Error ? err.message.toLowerCase() : '';
        const isPermissionBlock =
          errName === 'NotAllowedError' ||
          errName === 'SecurityError' ||
          errMsg.includes('not-allowed') ||
          errMsg.includes('permission');
        consecutiveStartFailures += 1;
        if (isPermissionBlock || consecutiveStartFailures >= 4) {
          disposed = true;
          setStandbyListening(false);
          setMicPermissionNeeded(true);
        } else {
          if (restartTimer !== null) {
            window.clearTimeout(restartTimer);
          }
          restartTimer = window.setTimeout(() => {
            restartTimer = null;
            if (!disposed) {
              startListener();
            }
          }, 300);
        }
      }
    };

    startListener();

    return () => {
      disposed = true;
      setStandbyListening(false);
      setStandbyAudioDetected(false);
      setStandbyHeardText('');
      if (restartTimer) {
        window.clearTimeout(restartTimer);
      }
      if (standbyHeardTimerRef.current) {
        window.clearTimeout(standbyHeardTimerRef.current);
        standbyHeardTimerRef.current = null;
      }
      if (standbyAudioDotTimerRef.current) {
        window.clearTimeout(standbyAudioDotTimerRef.current);
        standbyAudioDotTimerRef.current = null;
      }
      if (recognition) {
        try {
          recognition.onend = null;
          recognition.onerror = null;
          recognition.onresult = null;
          recognition.onsoundstart = null;
          recognition.onspeechstart = null;
          recognition.abort();
        } catch {
          // ignore
        }
      }
    };
  }, [
    authLoading,
    voiceSetupReady,
    needsVoiceCodeSetup,
    voiceCommandsOpen,
    settings.secretWakePhrase,
    settings.standbyWakeEnabled,
    settings.language,
    liveConnected,
    assistantState,
    wakeSequenceActive,
    sleepSequenceActive,
    micPermissionNeeded,
    standbyRetryNonce,
    triggerWakeSequence,
  ]);

  // Parallel Web Speech API Shutdown Watcher during an active Live Call
  // Works alongside Gemini Live inputTranscription to catch shutdown phrases instantly.
  useEffect(() => {
    if (!liveConnected || liveMuted || sleepSequenceActive) {
      return;
    }

    const SpeechCtor = getSpeechRecognitionCtor();
    if (!SpeechCtor) {
      return;
    }

    let disposed = false;
    let recognition: SpeechRecognitionInstance | null = null;
    let restartTimer: number | null = null;
    const activeLang: LanguageCode = settings.language;

    const startShutdownWatcher = () => {
      if (disposed) return;
      try {
        recognition = new SpeechCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 5;
        recognition.lang = activeLang;

        recognition.onresult = (event) => {
          if (disposed || sleepSequenceActiveRef.current) return;
          const activeShutdownPhrases = shutdownPhrasesRef.current;
          if (activeShutdownPhrases.length === 0) return;

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (!result?.isFinal) continue;
            const altCount = Math.min(5, result?.length ?? 5);
            for (let alt = 0; alt < altCount; alt++) {
              const transcript = result?.[alt]?.transcript;
              if (!transcript) continue;

              if (
                matchesStandalonePhraseList(transcript, activeShutdownPhrases)
              ) {
                disposed = true;
                try {
                  recognition?.abort();
                } catch {
                  // ignore abort errors
                }
                triggerSleepSequenceRef.current();
                return;
              }
            }
          }
        };

        recognition.onerror = (event) => {
          if (disposed) return;
          if (
            event.error === 'not-allowed' ||
            event.error === 'service-not-allowed' ||
            event.error === 'audio-capture'
          ) {
            // Browser blocked parallel speech recognition; Gemini Live inputTranscription remains active.
            disposed = true;
          }
        };

        recognition.onend = () => {
          if (disposed) return;
          restartTimer = window.setTimeout(() => {
            startShutdownWatcher();
          }, 260);
        };

        recognition.start();
      } catch {
        // Ignore if browser restricts parallel SpeechRecognition during active Live mic
      }
    };

    startShutdownWatcher();

    return () => {
      disposed = true;
      if (restartTimer) {
        window.clearTimeout(restartTimer);
      }
      if (recognition) {
        try {
          recognition.onend = null;
          recognition.onerror = null;
          recognition.onresult = null;
          recognition.abort();
        } catch {
          // ignore
        }
      }
    };
  }, [liveConnected, liveMuted, sleepSequenceActive, settings.language]);

  const sendMessage = useCallback(
    async (userText: string) => {
      const cleanUserText = userText.trim();
      if (!cleanUserText) return;

      if (liveConnected && liveClientRef.current) {
        appendTurn('user', cleanUserText);
        liveClientRef.current.sendText(cleanUserText);
        return;
      }

      setAssistantState('thinking');
      setInterimTranscript('');
      appendTurn('user', cleanUserText);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: userNameRef.current,
            message: cleanUserText,
            history: historyRef.current.slice(-30).map((h) => ({
              role: h.role,
              text: h.text,
            })),
            persona: settingsRef.current.personaInstructions,
            memories: memoriesRef.current.map((m) => ({
              category: m.category,
              content: m.content,
            })),
            tasks: tasksRef.current.map((t) => ({
              title: t.title,
              subject: t.subject,
              dueLabel: t.dueLabel,
              completed: t.completed,
            })),
            localDateTime: getLocalDateTimeLabel(),
            language: settingsRef.current.language,
          }),
        });

        const data = (await response.json()) as ChatApiResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || `Server error (${response.status})`);
        }

        const reply = stripMarkdownForSpeech(data.reply);
        appendTurn('model', reply);
        setCaptionText(reply);
        setAvatarEmotion(detectEmotionFromTranscript(reply));
        scheduleEmotionDecay();

        if (Array.isArray(data.actions)) {
          data.actions.forEach(applyStructuredAction);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Unable to reach Gemini right now.';
        setCaptionText(message);
        showToast(message);
      } finally {
        setAssistantState('idle');
      }
    },
    [appendTurn, applyStructuredAction, liveConnected, showToast],
  );

  const handleToggleMute = () => {
    if (!liveClientRef.current) return;
    const nextMuted = !liveMuted;
    liveClientRef.current.setMuted(nextMuted);
    setLiveMuted(nextMuted);
  };

  const handleChangeLanguage = (lang: LanguageCode) => {
    if (lang === settings.language) return;
    updateSettings((prev) => ({ ...prev, language: lang }));
  };

  const activateVoiceStandby = useCallback(async () => {
    unlockAudioPlayback();
    if (!getSpeechRecognitionCtor()) {
      showToast(
        'Voice-code Standby Wake requires a browser with Web Speech API (Chrome / Edge).',
      );
      return;
    }

    try {
      let micAlreadyGranted = false;
      if (navigator.permissions?.query) {
        try {
          const perm = await navigator.permissions.query({
            name: 'microphone' as PermissionName,
          });
          micAlreadyGranted = perm.state === 'granted';
        } catch {
          // Ignore browsers without microphone permissions query support
        }
      }

      if (!micAlreadyGranted && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }

      standbyManuallyMutedRef.current = false;
      setMicPermissionNeeded(false);
      if (!settingsRef.current.standbyWakeEnabled) {
        updateSettings({ standbyWakeEnabled: true });
      }
      setStandbyRetryNonce((n) => n + 1);
      showToast('Voice standby active — speak your secret wake code');
    } catch {
      showToast('Please allow microphone access in your browser settings.');
    }
  }, [showToast, updateSettings]);

  const handleToggleStandbyWake = async () => {
    unlockAudioPlayback();
    if (!getSpeechRecognitionCtor()) {
      showToast(
        'Voice-code Standby Wake requires a browser with Web Speech API (Chrome / Edge).',
      );
      return;
    }

    if (micPermissionNeeded) {
      await activateVoiceStandby();
      return;
    }

    const next = !settings.standbyWakeEnabled;
    standbyManuallyMutedRef.current = !next;
    updateSettings({ standbyWakeEnabled: next });
    showToast(
      next
        ? 'Standby listener active — say your voice code anytime'
        : 'Standby listener muted',
    );
  };

  const handleToggleMiniWidget = () => {
    setMiniWidget((prev) => {
      const next = !prev;
      if (next) {
        setVoiceCommandsOpen(false);
        setMemoryOpen(false);
        setSettingsOpen(false);
      }
      return next;
    });
  };

  const getLipSyncWeights = useCallback((): LipSyncWeights => {
    if (liveClientRef.current) {
      return liveClientRef.current.getLipSyncWeights();
    }
    return EMPTY_LIP_SYNC;
  }, []);

  const getAudioSpectrum = useCallback((bins: Uint8Array<ArrayBuffer>): boolean => {
    if (liveClientRef.current) {
      return liveClientRef.current.copyFrequencyBins(bins);
    }
    bins.fill(0);
    return false;
  }, []);

  const isSleeping =
    !wakeSequenceActive &&
    !bootSequenceActive &&
    (sleepSequenceActive || (!liveConnected && assistantState === 'idle'));

  const showTapToEnableStandby =
    micPermissionNeeded &&
    settings.standbyWakeEnabled &&
    !needsVoiceCodeSetup &&
    !voiceCommandsOpen &&
    !settingsOpen &&
    !memoryOpen &&
    !liveConnected &&
    assistantState === 'idle';

  const resolvedVrmUrl = vrmMetadata
    ? vrmUrl
    : settings.customGlbUrl.trim()
      ? ''
      : DEFAULT_BUILTIN_VRM_URL;

  const resolvedCustomUrl = vrmMetadata ? '' : settings.customGlbUrl.trim();

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#030711]">
      {/* Full-Viewport 3D Tampi / VRM Stage */}
      <TampiStage
        assistantState={assistantState}
        emotion={avatarEmotion}
        isSleeping={isSleeping}
        isAvatarResolving={vrmResolving}
        vrmUrl={resolvedVrmUrl}
        customGlbUrl={resolvedCustomUrl}
        miniWidget={miniWidget}
        standbyListening={standbyListening}
        wakePulseKey={wakePulseKey}
        sleepPulseKey={sleepPulseKey}
        getLipSyncWeights={getLipSyncWeights}
        onGlbError={showToast}
      />

      {/* One-Tap Overlay when Browser Autoplay / Mic Policy Blocks SpeechRecognition */}
      {showTapToEnableStandby && (
        <button
          type="button"
          onClick={() => {
            void activateVoiceStandby();
          }}
          aria-label="Tap anywhere to enable voice standby"
          className="fixed inset-0 z-[15] flex items-center justify-center bg-[#030711]/35 cursor-pointer focus:outline-none"
        >
          <span className="pointer-events-none flex items-center gap-3 rounded-2xl bg-[#071122]/94 border border-amber-400/55 px-5 py-3 text-xs sm:text-sm font-medium tracking-wide text-amber-100 shadow-[0_0_32px_rgba(245,158,11,0.28)]">
            <Mic className="h-4 w-4 text-amber-300 shrink-0" />
            <span>Tap anywhere to enable voice standby</span>
          </span>
        </button>
      )}

      {/* Stark J.A.R.V.I.S. Holographic HUD Reticles, Scanline Sweep & Circular Audio Visualizer */}
      <StarkHud
        assistantState={assistantState}
        emotion={avatarEmotion}
        liveConnected={liveConnected}
        standbyListening={standbyListening}
        bootSequenceActive={bootSequenceActive}
        wakePulseKey={wakePulseKey}
        miniWidget={miniWidget}
        getAudioSpectrum={getAudioSpectrum}
      />

      {/* Minimal Top Bar & Floating Study Timer (hidden in Mini Widget Mode) */}
      {!miniWidget && (
        <TopBar
          assistantState={assistantState}
          voiceMode="live"
          timer={timer}
          memoryCount={memories.length}
          pendingTaskCount={tasks.filter((t) => !t.completed).length}
          userDisplayName={user?.displayName || user?.email || null}
          userPhotoUrl={user?.photoURL || null}
          authLoading={authLoading}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void handleSignOut()}
          onTogglePauseTimer={() =>
            setTimer((prev) => ({ ...prev, paused: !prev.paused }))
          }
          onAddFiveMinutes={() =>
            setTimer((prev) => ({
              ...prev,
              totalSeconds: prev.totalSeconds + 300,
              remainingSeconds: prev.remainingSeconds + 300,
            }))
          }
          onStopTimer={() =>
            setTimer((prev) => ({
              ...prev,
              active: false,
              paused: false,
              remainingSeconds: prev.totalSeconds,
            }))
          }
          onOpenVoiceCommands={() => setVoiceCommandsOpen(true)}
          onOpenMemory={() => setMemoryOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleMiniWidget={handleToggleMiniWidget}
        />
      )}

      {/* Futuristic Center HUD Badge on Voice-Code Verification */}
      {wakeHudVisible && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-4">
          <div className="wake-hud-pop relative flex flex-col items-center gap-1 rounded-2xl bg-[#061220]/92 border border-cyan-400/75 px-5 py-3 shadow-[0_0_40px_rgba(34,211,238,0.45)]">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-300 shrink-0" />
              <span className="font-mono text-xs sm:text-sm font-semibold tracking-[0.14em] text-cyan-100 drop-shadow-[0_0_10px_rgba(34,211,238,0.75)]">
                IDENTITY VERIFIED • ACCESS GRANTED
              </span>
            </div>
            {user && (
              <span className="font-mono text-[11px] tracking-[0.12em] text-emerald-300/90">
                WELCOME, {userFirstName.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Glowing Amber/Cyan Center HUD Badge on Voice-Activated Shutdown */}
      {sleepHudVisible && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-4">
          <div className="wake-hud-pop relative flex items-center gap-3 rounded-2xl bg-[#0b101d]/94 border border-amber-400/75 ring-1 ring-cyan-400/40 px-5 py-3 shadow-[0_0_42px_rgba(245,158,11,0.38),0_0_24px_rgba(34,211,238,0.28)]">
            <Moon className="h-5 w-5 text-amber-300 shrink-0" />
            <span className="font-mono text-xs sm:text-sm font-semibold tracking-[0.14em] text-amber-100 drop-shadow-[0_0_10px_rgba(245,158,11,0.65)]">
              SYSTEM STANDBY • TAMPI SLEEPING
            </span>
          </div>
        </div>
      )}

      {/* Transient Notification Toast */}
      {toastMessage && !miniWidget && (
        <div className="pointer-events-none fixed left-1/2 top-16 z-30 -translate-x-1/2 rounded-xl bg-[#0d1422]/95 border border-cyan-400/30 px-4 py-2 text-xs font-medium text-cyan-100 shadow-lg">
          {toastMessage}
        </div>
      )}

      {/* Collapsible Bottom Live Voice Dock (hidden in Mini Widget Mode) */}
      {!miniWidget && (
        <VoiceDock
          assistantState={assistantState}
          emotion={avatarEmotion}
          language={settings.language}
          liveConnected={liveConnected}
          liveMuted={liveMuted}
          standbyWakeEnabled={settings.standbyWakeEnabled}
          standbyListening={standbyListening}
          standbyAudioDetected={standbyAudioDetected}
          standbyHeardText={standbyHeardText}
          micPermissionNeeded={micPermissionNeeded}
          needsVoiceCodeSetup={needsVoiceCodeSetup}
          captionText={captionText}
          interimTranscript={interimTranscript}
          history={history}
          userFirstName={userFirstName}
          onToggleMute={handleToggleMute}
          onToggleStandbyWake={() => {
            void handleToggleStandbyWake();
          }}
          onStopSpeaking={stopSpeaking}
          onChangeLanguage={handleChangeLanguage}
          onSendText={(text) => {
            void sendMessage(text);
          }}
        />
      )}

      {/* Mini Widget Mode: Tiny Translucent Floating Standby & Mic Pill */}
      {miniWidget && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-col items-center gap-2 px-4">
          {!liveConnected && (
            <button
              type="button"
              disabled={!micPermissionNeeded}
              onClick={() => {
                if (micPermissionNeeded) {
                  void activateVoiceStandby();
                }
              }}
              className={`pointer-events-auto flex max-w-[90vw] items-center gap-2 rounded-full bg-[#081322]/85 border px-3 py-1 shadow-[0_0_18px_rgba(34,211,238,0.2)] ${
                micPermissionNeeded
                  ? 'border-amber-400/50 cursor-pointer hover:bg-amber-500/15'
                  : 'border-cyan-400/35 cursor-default'
              }`}
            >
              <span className="relative flex h-3.5 w-3.5 items-center justify-center shrink-0">
                <span
                  className={`absolute inset-0 rounded-full border ${
                    micPermissionNeeded
                      ? 'border-amber-400 opacity-75'
                      : settings.standbyWakeEnabled && !needsVoiceCodeSetup
                        ? 'border-cyan-400 standby-ring-breath'
                        : 'border-cyan-400 opacity-40'
                  }`}
                />
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    micPermissionNeeded ? 'bg-amber-300' : 'bg-cyan-300'
                  }`}
                />
              </span>
              <span
                className={`text-[11px] font-medium whitespace-nowrap ${
                  micPermissionNeeded
                    ? 'text-amber-200'
                    : settings.standbyWakeEnabled
                      ? 'text-cyan-200'
                      : 'text-slate-400'
                }`}
              >
                {assistantState === 'thinking'
                  ? 'Connecting...'
                  : needsVoiceCodeSetup
                    ? 'Set voice codes first'
                    : micPermissionNeeded
                      ? 'Tap anywhere to enable voice standby'
                      : settings.standbyWakeEnabled
                        ? 'Standby • Speak your secret wake code'
                        : 'Standby muted'}
              </span>
              {standbyListening && standbyAudioDetected && !micPermissionNeeded && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
              )}
            </button>
          )}

          <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-[#0a111f]/80 border border-cyan-400/25 px-2.5 py-1.5 shadow-2xl">
            {liveConnected ? (
              <button
                type="button"
                onClick={handleToggleMute}
                title={liveMuted ? 'Unmute Mic' : 'Mute Mic'}
                aria-label={liveMuted ? 'Unmute Mic' : 'Mute Mic'}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors shrink-0 ${
                  liveMuted
                    ? 'bg-rose-500/20 border-rose-400/40 text-rose-200'
                    : 'bg-emerald-500/18 border-emerald-400/45 text-emerald-200 hover:bg-emerald-500/28'
                }`}
              >
                {liveMuted ? (
                  <MicOff className="h-3.5 w-3.5" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void handleToggleStandbyWake();
                }}
                title={
                  micPermissionNeeded
                    ? 'Enable Microphone Permission'
                    : settings.standbyWakeEnabled
                      ? 'Mute Standby Mic'
                      : 'Enable Standby Mic'
                }
                aria-label={
                  micPermissionNeeded
                    ? 'Enable Microphone Permission'
                    : settings.standbyWakeEnabled
                      ? 'Mute Standby Mic'
                      : 'Enable Standby Mic'
                }
                aria-pressed={settings.standbyWakeEnabled && !micPermissionNeeded}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors shrink-0 ${
                  micPermissionNeeded
                    ? 'bg-amber-500/25 border-amber-400/55 text-amber-200 animate-pulse'
                    : settings.standbyWakeEnabled
                      ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                      : 'bg-white/[0.05] border-white/12 text-slate-400 hover:text-white'
                }`}
              >
                {settings.standbyWakeEnabled || micPermissionNeeded ? (
                  <Mic className="h-3.5 w-3.5" />
                ) : (
                  <MicOff className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleMiniWidget}
              title="Exit Mini Widget Mode"
              aria-label="Exit Mini Widget Mode"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] border border-white/12 text-slate-300 hover:bg-white/15 hover:text-white transition-colors shrink-0"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Personal Memory & Study Task Drawer */}
      <MemoryDrawer
        open={memoryOpen}
        memories={memories}
        tasks={tasks}
        sessions={sessions}
        historyCount={history.length}
        isSignedIn={Boolean(user)}
        onClose={() => setMemoryOpen(false)}
        onAddMemory={(category, content) => {
          void handleAddMemory(category, content);
        }}
        onDeleteMemory={(id) => {
          void handleDeleteMemory(id);
        }}
        onAddTask={handleAddTask}
        onToggleTask={handleToggleTask}
        onDeleteTask={handleDeleteTask}
        onClearHistory={handleClearHistory}
      />

      {/* Dedicated Secret Voice Commands Modal */}
      <VoiceCommandsModal
        open={voiceCommandsOpen}
        secretWakePhrase={settings.secretWakePhrase}
        secretShutdownPhrase={settings.secretShutdownPhrase}
        isSignedIn={Boolean(user)}
        isFirstTimeSetup={needsVoiceCodeSetup}
        userEmail={user?.email ?? null}
        onClose={() => setVoiceCommandsOpen(false)}
        onSave={(nextWake, nextShutdown) => {
          const nextWakeList = parseVoicePhraseList(nextWake);
          const nextShutdownList = parseVoicePhraseList(nextShutdown);
          const configured =
            nextWakeList.length > 0 && nextShutdownList.length > 0;

          wakePhrasesRef.current = nextWakeList;
          shutdownPhrasesRef.current = nextShutdownList;
          setNeedsVoiceCodeSetup(!configured);

          let latestSettings: TampiSettings = {
            ...settingsRef.current,
            secretWakePhrase: nextWake,
            secretShutdownPhrase: nextShutdown,
            voiceCodesConfigured: configured,
          };

          setSettings((prev) => {
            const next: TampiSettings = {
              ...prev,
              secretWakePhrase: nextWake,
              secretShutdownPhrase: nextShutdown,
              voiceCodesConfigured: configured,
            };
            latestSettings = next;
            settingsRef.current = next;
            saveSettings(next, scopeKeyRef.current);
            return next;
          });

          if (profileSyncTimerRef.current) {
            window.clearTimeout(profileSyncTimerRef.current);
            profileSyncTimerRef.current = null;
          }

          if (userRef.current) {
            void saveUserVoiceCommands(
              userRef.current,
              nextWake,
              nextShutdown,
              latestSettings,
            ).catch((err) => {
              showToast(
                err instanceof Error
                  ? err.message
                  : 'Failed to save voice commands.',
              );
            });
          }

          setStandbyRetryNonce((n) => n + 1);
          setCaptionText(configured ? STANDBY_CAPTION : SETUP_REQUIRED_CAPTION);
          showToast('Voice commands saved privately');
        }}
      />

      {/* Studio Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        settings={settings}
        vrmMetadata={vrmMetadata}
        vrmUploading={vrmUploading}
        userEmail={user?.email ?? null}
        userDisplayName={user ? userDisplayName : null}
        authLoading={authLoading}
        onSignIn={() => {
          void handleSignIn();
        }}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={(patch) => updateSettings(patch)}
        onUploadVrm={(file) => {
          void handleUploadVrm(file);
        }}
        onClearVrm={() => {
          void handleClearVrm();
        }}
      />
    </main>
  );
}
