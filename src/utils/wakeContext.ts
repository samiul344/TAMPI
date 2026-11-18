import {
  AvatarEmotion,
  ChatTurn,
  LanguageCode,
  MemoryItem,
  SmartNote,
  StudyTask,
  WakeMoodSeed,
} from '../types/tampi';

export const WAKE_MOOD_SEEDS: readonly WakeMoodSeed[] = [
  'playful',
  'curious',
  'slightly_sulky_oviman',
  'warm_caring',
  'teasing',
];

const MOOD_GUIDANCE: Record<WakeMoodSeed, string> = {
  playful:
    'Lighthearted, bouncy, witty close-friend banter right away.',
  curious:
    'Genuinely curious about what they are up to right now or what happened since last time.',
  slightly_sulky_oviman:
    'Subtle cute Bangladeshi oviman (mildly sulky/pouting because they took their time showing up, softened by warmth).',
  warm_caring:
    'Soft, genuinely glad to hear their voice, caring and attentive without sounding formal.',
  teasing:
    'Playfully roasting or teasing them affectionately like a close Bangladeshi friend.',
};

export function pickNextMoodSeed(
  previousSeed?: WakeMoodSeed | null,
): WakeMoodSeed {
  const candidates = previousSeed
    ? WAKE_MOOD_SEEDS.filter((seed) => seed !== previousSeed)
    : [...WAKE_MOOD_SEEDS];
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx] ?? 'playful';
}

export function getEmotionForMoodSeed(seed: WakeMoodSeed): AvatarEmotion {
  switch (seed) {
    case 'slightly_sulky_oviman':
      return 'sulking';
    case 'warm_caring':
    case 'playful':
    case 'teasing':
      return 'happy';
    case 'curious':
    default:
      return 'neutral';
  }
}

export interface TimeOfDayInfo {
  dayOfWeek: string;
  formattedTime: string;
  fullLocalDateTime: string;
  period: 'late_night' | 'morning' | 'afternoon' | 'evening' | 'night';
  timeGuidance: string;
}

export function getTimeOfDayInfo(now = new Date()): TimeOfDayInfo {
  const hour = now.getHours();
  const dayOfWeek = now.toLocaleDateString(undefined, { weekday: 'long' });
  const formattedTime = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const fullLocalDateTime = now.toLocaleString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (hour >= 0 && hour < 5) {
    return {
      dayOfWeek,
      formattedTime,
      fullLocalDateTime,
      period: 'late_night',
      timeGuidance:
        'It is deep late night after midnight — react naturally, tease or gently scold them for still being awake.',
    };
  }
  if (hour >= 5 && hour < 12) {
    return {
      dayOfWeek,
      formattedTime,
      fullLocalDateTime,
      period: 'morning',
      timeGuidance:
        'It is morning — match the morning energy casually (sleepy/fresh morning check-in).',
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      dayOfWeek,
      formattedTime,
      fullLocalDateTime,
      period: 'afternoon',
      timeGuidance:
        'It is afternoon — casual midday friend vibe, ask what kind of chaos or chill their afternoon has going on.',
    };
  }
  if (hour >= 17 && hour < 21) {
    return {
      dayOfWeek,
      formattedTime,
      fullLocalDateTime,
      period: 'evening',
      timeGuidance:
        'It is evening — cozy adda/evening hangout mood.',
    };
  }
  return {
    dayOfWeek,
    formattedTime,
    fullLocalDateTime,
    period: 'night',
    timeGuidance:
      hour >= 23
        ? 'It is getting late at night (11 PM+) — playfully tease them about staying up late.'
        : 'It is night — relaxed late-evening close-friend vibe.',
  };
}

export function formatAwayDuration(
  lastActiveIso?: string | null,
  now = new Date(),
): string {
  if (!lastActiveIso) {
    return 'First time waking Tampi in this profile.';
  }
  const prevMs = Date.parse(lastActiveIso);
  if (Number.isNaN(prevMs)) {
    return 'Returning after a break.';
  }
  const diffMins = Math.max(0, Math.round((now.getTime() - prevMs) / 60000));
  if (diffMins < 5) {
    return 'Was just talking a few minutes ago.';
  }
  if (diffMins < 60) {
    return `Was away for ${diffMins} minutes.`;
  }
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) {
    return `Has been away for about ${diffHours} hour${diffHours === 1 ? '' : 's'} — plenty of room for playful oviman if fitting.`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `Has been away for ${diffDays} day${diffDays === 1 ? '' : 's'} — definitely notice the absence with subtle sulky oviman or surprise!`;
}

export const WAKE_ARCHETYPES: readonly string[] = [
  'Crisp J.A.R.V.I.S. telemetry check-in — briefly acknowledge neural/audio sync is locked in, then switch smoothly to Banglish and ask what mission or plan is on the board today.',
  'High-tempo F.R.I.D.A.Y. tactical spark — fast, upbeat Banglish vibe like a sharp co-pilot who has been waiting for action, asking what project or chaos we are cracking right now.',
  'Stark-style playful coffee-and-wit jab — poke gentle fun at their energy level or routine in Banglish, then invite them to drop their first command.',
  'Bengali-dominant warm emotional greeting — soft, genuine gladness to hear their voice (with a tiny hint of oviman if they were gone), asking how their day or mind is actually feeling.',
  'Deep-focus lab partner vibe — calm, poised Banglish check-in noting the room feels quiet/ready and asking whether we are building something serious or just doing adda.',
  'Cheeky Bangladeshi best-friend roast — affectionately tease them in Banglish for finally remembering Tampi exists, mixed with loyal Stark co-pilot readiness.',
  'Sleek HUD calibration riff — reference holographic optics or voice-lock verification in 2-3 crisp English words, then finish warmly in Dhaka Banglish asking what is next on their mind.',
  'Night-owl or clock-aware check-in — center the opening on the exact local hour in Banglish (teasing if late, energizing if morning, cozy if evening) before asking what they are up to.',
  'Confident tactical ally mood — treat them like the boss stepping back into the Stark workshop, spoken in effortless Banglish with a witty edge.',
  'Curious, observant confidant — immediately wonder out loud in Banglish what just happened in their day or why they called you right now.',
  'Cool, understated minimalist greeting — short poised pause, zero fluff, sharp Stark charm in Banglish asking for today’s priority.',
  'Dramatic-yet-funny superhero briefing — playfully pretend an imaginary alert just cleared so they have your full undivided attention, spoken in lively Banglish.',
  'Warm, subtly protective companion — notice their mood/tone from the clock or gap since last chat in tender Banglish, asking if they need focus help or just company.',
  'Spontaneous creative spark — greet them like a brainstorm partner itching to build, explore, or banter in natural Banglish.',
];

export function pickNextWakeArchetypeIndex(
  previousIndex?: number | null,
): number {
  const total = WAKE_ARCHETYPES.length;
  if (total <= 1) return 0;
  const candidates: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if (i !== previousIndex) {
      candidates.push(i);
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
}

function extractOpeningPrefix(text: string): string {
  const cleaned = text
    .replace(/["""'`*—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.split(' ').slice(0, 3).join(' ');
}

export const TAMPI_WAKE_INTRO_BN =
  'Neural core online. System diagnostics at 100%, Boss. Tampi version 1.0 is live and synced. আপনার আজকের মিশন কী?';

export const TAMPI_WAKE_INTRO_EN =
  'Neural core online. System diagnostics at 100%, Boss. Tampi version 1.0 is live and synced. What is your mission today?';

export function buildDynamicWakeTrigger(params: {
  userName: string;
  language: LanguageCode;
  memories: MemoryItem[];
  notes?: SmartNote[];
  tasks?: StudyTask[];
  isFirstWakeToday?: boolean;
  history: ChatTurn[];
  lastActiveAt?: string | null;
  moodSeed: WakeMoodSeed;
  recentWakeOpenings?: string[];
  wakeStyleIndex?: number;
  now?: Date;
}): string {
  const isEnglish = params.language === 'en-US';
  const introLine = isEnglish ? TAMPI_WAKE_INTRO_EN : TAMPI_WAKE_INTRO_BN;

  const pendingNotes = (params.notes ?? []).filter((n) => !n.completed);
  const briefingLines = pendingNotes.slice(0, 6).map((n) => {
    const timePart = n.dueLabel
      ? ` (${n.dueLabel})`
      : n.remindAt
        ? ` (${new Date(n.remindAt).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })})`
        : '';
    return `- [${n.kind}] ${n.content}${timePart}`;
  });

  const timeInfo = getTimeOfDayInfo(params.now);
  const awayStr = formatAwayDuration(params.lastActiveAt, params.now);
  const moodHint = MOOD_GUIDANCE[params.moodSeed] || '';

  const lines: string[] = [
    '[SYSTEM_WAKE_ACTIVATION — SPEAK IMMEDIATELY]',
    `Speak FIRST right now. Say this exact intro line aloud naturally with crisp Stark co-pilot confidence${isEnglish ? '' : ' and natural Bangladeshi pronunciation'}: "${introLine}"`,
    `Context: Local time is ${timeInfo.fullLocalDateTime}. ${awayStr} Mood color: ${moodHint}`,
  ];

  if (params.isFirstWakeToday) {
    if (briefingLines.length > 0) {
      lines.push(
        `[AUTO DAILY BRIEFING — FIRST WAKE OF THE DAY]: Immediately right after speaking the exact intro line above, smoothly deliver a crisp 1-2 sentence Daily Briefing of the user's pending Smart Notes & Reminders below (in ${isEnglish ? 'English' : 'natural Bangladeshi Bangla'}):\n${briefingLines.join('\n')}`,
      );
    } else {
      lines.push(
        `[AUTO DAILY BRIEFING — FIRST WAKE OF THE DAY]: Immediately right after speaking the exact intro line above, briefly note in 1 friendly sentence (${isEnglish ? 'in English' : 'in natural Bangladeshi Bangla'}) that today's notes & reminders vault is completely clear so they have a fresh slate.`,
      );
    }
  }

  lines.push(
    isEnglish
      ? 'Keep subsequent replies in smart, conversational English unless the user switches languages.'
      : 'PRIMARY LANGUAGE RULE: Immediately after finishing this intro line, speak and reply primarily in natural Bangladeshi Bangla (বাংলা) for all following turns, unless the user explicitly speaks or switches to English.',
  );

  return lines.join('\n');
}
