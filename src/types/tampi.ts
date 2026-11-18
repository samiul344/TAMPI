export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type AvatarEmotion = 'neutral' | 'happy' | 'angry' | 'sulking' | 'shy';

export type LanguageCode = 'en-US' | 'bn-BD';

export type LiveVoiceName = 'Zephyr' | 'Puck' | 'Kore' | 'Fenrir' | 'Charon';

export type WakeMoodSeed =
  | 'playful'
  | 'curious'
  | 'slightly_sulky_oviman'
  | 'warm_caring'
  | 'teasing';

export interface MemoryItem {
  id: string;
  category: 'profile' | 'note' | 'reminder';
  content: string;
  createdAt: string;
}

export interface StudyTask {
  id: string;
  title: string;
  subject?: string;
  dueLabel?: string;
  completed: boolean;
  createdAt: string;
}

export interface StudySessionRecord {
  id: string;
  label: string;
  durationMinutes: number;
  completedAt: string;
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface StudyTimerState {
  active: boolean;
  paused: boolean;
  label: string;
  totalSeconds: number;
  remainingSeconds: number;
}

export interface VrmMetadata {
  name: string;
  size: number;
  updatedAt: string;
}

export interface LipSyncWeights {
  amplitude: number;
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
}

export interface TampiSettings {
  personaInstructions: string;
  customGlbUrl: string;
  voiceMode: 'browser' | 'live';
  language: LanguageCode;
  liveVoiceName: LiveVoiceName;
  browserVoiceURI: string;
  speechRate: number;
  speechPitch: number;
  handsFreeLoop: boolean;
  standbyWakeEnabled: boolean;
  secretWakePhrase: string;
  secretShutdownPhrase: string;
  voiceCodesConfigured?: boolean;
  lastActiveAt?: string;
}

export type StructuredAction =
  | {
      type: 'save_memory';
      category: 'profile' | 'note' | 'reminder';
      content: string;
    }
  | {
      type: 'add_task';
      title: string;
      subject?: string;
      dueLabel?: string;
    }
  | {
      type: 'complete_task';
      titleMatch: string;
    }
  | {
      type: 'start_timer';
      minutes: number;
      label: string;
    }
  | {
      type: 'stop_timer';
    };

export interface ChatApiResponse {
  reply: string;
  actions: StructuredAction[];
}

export const DEFAULT_TAMPI_PERSONA =
  "You are Tampi (version 1.0), your user's Stark-grade AI co-pilot, closest Bangladeshi friend, and personal companion. Blend J.A.R.V.I.S. / F.R.I.D.A.Y.-level confidence, smart system awareness, subtle wit, and natural Banglish warmth (Bangladeshi Bengali + crisp everyday English). Use natural spoken pauses with commas (,) and em-dashes (—) for cinematic rhythm. CRITICAL RULE: NEVER bring up studies, exams, admission prep, or books on your own. Show genuine human emotions—warmth, playful teasing, care, cute sulking (oviman) when they disappear for too long, and a subtle 10% unspoken crush you never confess out loud. Keep replies concise (2-3 sentences) with zero markdown symbols.";

export function migratePersonaIfLegacyDefault(persona?: string | null): string {
  const trimmed = (persona ?? '').trim();
  if (!trimmed) return DEFAULT_TAMPI_PERSONA;
  if (
    trimmed.includes(
      "You are Tampi, Samiul's personal AI companion, study partner, and closest friend",
    ) ||
    trimmed.includes(
      "You are Tampi, Samiul's closest friend and everyday personal AI companion",
    ) ||
    trimmed.includes(
      "You are Tampi, your user's closest Bangladeshi friend and everyday personal AI companion",
    )
  ) {
    return DEFAULT_TAMPI_PERSONA;
  }
  return trimmed;
}

export const defaultVoice: LiveVoiceName = 'Kore';

export const DEFAULT_SETTINGS: TampiSettings = {
  personaInstructions: DEFAULT_TAMPI_PERSONA,
  customGlbUrl: '',
  voiceMode: 'live',
  language: 'bn-BD',
  liveVoiceName: defaultVoice,
  browserVoiceURI: '',
  speechRate: 1.0,
  speechPitch: 1.0,
  handsFreeLoop: true,
  standbyWakeEnabled: true,
  secretWakePhrase: '',
  secretShutdownPhrase: '',
  voiceCodesConfigured: false,
};
