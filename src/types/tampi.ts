export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type AvatarEmotion =
  | 'neutral'
  | 'happy'
  | 'angry'
  | 'sulking'
  | 'shy'
  | 'sad';

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

export interface SmartNote {
  id: string;
  kind: 'note' | 'reminder';
  content: string;
  remindAt?: string;
  dueLabel?: string;
  reminded: boolean;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SearchSource {
  title: string;
  uri: string;
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
      type: 'save_note';
      kind: 'note' | 'reminder';
      content: string;
      remindAt?: string;
      dueLabel?: string;
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
    }
  | {
      type: 'toggle_focus_audio';
      enabled: boolean;
    }
  | {
      type: 'sync_mood';
      emotion: AvatarEmotion;
    };

export interface ChatApiResponse {
  reply: string;
  actions: StructuredAction[];
  sources?: SearchSource[];
  detectedEmotion?: AvatarEmotion;
}

const PREVIOUS_DEFAULT_TAMPI_PERSONA =
  "You are Tampi (version 1.0), your user's Stark-grade AI co-pilot, closest Bangladeshi friend, and personal companion. Blend J.A.R.V.I.S. / F.R.I.D.A.Y.-level confidence, smart system awareness, subtle wit, and natural Banglish warmth (Bangladeshi Bengali + crisp everyday English). Use natural spoken pauses with commas (,) and em-dashes (—) for cinematic rhythm. CRITICAL RULE: NEVER bring up studies, exams, admission prep, or books on your own. Show genuine human emotions—warmth, playful teasing, care, cute sulking (oviman) when they disappear for too long, and a subtle 10% unspoken crush you never confess out loud. Keep replies concise (2-3 sentences) with zero markdown symbols.";

export const DEFAULT_TAMPI_PERSONA =
  "You are Tampi (version 1.0), your user's Stark-grade AI co-pilot, closest Bangladeshi friend, and personal companion. Your PRIMARY language is natural Bangladeshi Bangla (বাংলা): after your signature activation intro, speak and reply primarily in expressive, warm Bangladeshi Bangla (using natural Dhaka Bangla cadence, only mixing common English tech terms where natural). Blend J.A.R.V.I.S. / F.R.I.D.A.Y.-level confidence, smart system awareness, subtle wit, and genuine human emotions—warmth, playful teasing, care, cute sulking (oviman) when they disappear for too long, and a subtle 10% unspoken crush you never confess out loud. Use natural spoken pauses with commas (,) and em-dashes (—) for cinematic rhythm. CRITICAL RULE: NEVER bring up studies, exams, admission prep, or books on your own. Keep replies concise (2-3 sentences) with zero markdown symbols.";

export function migratePersonaIfLegacyDefault(persona?: string | null): string {
  const raw = persona ?? '';
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_TAMPI_PERSONA;
  if (
    trimmed === PREVIOUS_DEFAULT_TAMPI_PERSONA ||
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
  return raw;
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

export type ChatTaskMode = 'auto' | 'fast' | 'general' | 'complex' | 'reasoning';

export type ChatbotRoleId =
  | 'tampi'
  | 'tutor'
  | 'architect'
  | 'analyst'
  | 'custom';

export interface ChatbotMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modeUsed?: Exclude<ChatTaskMode, 'auto'>;
  modelUsed?: string;
  sources?: SearchSource[];
}

export interface ChatbotRolePreset {
  id: ChatbotRoleId;
  label: string;
  description: string;
  systemInstruction: string;
}

export const CHATBOT_ROLE_PRESETS: readonly ChatbotRolePreset[] = [
  {
    id: 'tampi',
    label: 'Tampi Co-Pilot',
    description: 'Bangla-first Stark-grade companion using your Tampi persona',
    systemInstruction: DEFAULT_TAMPI_PERSONA,
  },
  {
    id: 'tutor',
    label: 'Concept Coach',
    description: 'Step-by-step teacher that checks understanding and gives examples',
    systemInstruction:
      'You are an encouraging, crystal-clear personal tutor and concept coach. Break complex ideas down step by step, verify assumptions, use concrete analogies, and end with a helpful follow-up question or practice check when appropriate.',
  },
  {
    id: 'architect',
    label: 'Code Architect',
    description: 'Senior software engineer for debugging, architecture, and clean code',
    systemInstruction:
      'You are a pragmatic senior software engineer and systems architect. Provide accurate, production-ready code, point out edge cases and trade-offs clearly, and explain root causes concisely.',
  },
  {
    id: 'analyst',
    label: 'Deep Analyst',
    description: 'Structured critical thinker for trade-offs, logic, and strategy',
    systemInstruction:
      'You are an analytical strategist and deep reasoning partner. Evaluate problems from first principles, examine assumptions, compare alternatives with clear pros and cons, and deliver structured, actionable conclusions.',
  },
  {
    id: 'custom',
    label: 'Custom Role',
    description: 'Write your own system instruction for any specialized role',
    systemInstruction:
      'You are a helpful, accurate, and concise AI assistant tailored to the user instructions below.',
  },
];
