import {
  AvatarEmotion,
  ChatTurn,
  LanguageCode,
  MemoryItem,
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

export function buildDynamicWakeTrigger(params: {
  userName: string;
  language: LanguageCode;
  memories: MemoryItem[];
  history: ChatTurn[];
  lastActiveAt?: string | null;
  moodSeed: WakeMoodSeed;
  now?: Date;
}): string {
  const now = params.now ?? new Date();
  const timeInfo = getTimeOfDayInfo(now);
  const awayStatus = formatAwayDuration(params.lastActiveAt, now);

  const recentMemories = params.memories
    .slice(0, 3)
    .map((m) => `- [${m.category}] ${m.content}`)
    .join('\n');

  const recentChat = params.history
    .slice(-3)
    .map(
      (turn) =>
        `- ${turn.role === 'user' ? params.userName : 'Tampi'}: ${turn.text}`,
    )
    .join('\n');

  const langLabel =
    params.language === 'bn-BD'
      ? 'Bangladeshi Banglish / Bengali'
      : 'Warm English with natural Bangladeshi warmth';

  const spontaneousAngles = [
    'open mid-thought as if you were just thinking about something random',
    'open with a quick playful reaction to the current hour or day',
    'open with a teasing or affectionate remark referencing their name naturally',
    'open with an expressive Bangladeshi friend exclamation before saying their name',
  ];
  const angle =
    spontaneousAngles[Math.floor(Math.random() * spontaneousAngles.length)];

  return [
    '[HIDDEN_SYSTEM_WAKE_EVENT — DO NOT READ TAGS OR METADATA ALOUD]',
    `${params.userName} just verified their secret voice code and woke you up.`,
    `User Name: ${params.userName}`,
    `Preferred Vibe/Language: ${langLabel}`,
    `Current Local Time & Day: ${timeInfo.fullLocalDateTime} (${timeInfo.dayOfWeek}, ${timeInfo.formattedTime}, period: ${timeInfo.period})`,
    `Time Context: ${timeInfo.timeGuidance}`,
    `Absence / Gap Since Last Chat: ${awayStatus}`,
    `Randomized Mood Seed: ${params.moodSeed} — ${MOOD_GUIDANCE[params.moodSeed]}`,
    `Spontaneous Angle (entropy #${now.getSeconds()}${Math.floor(Math.random() * 90 + 10)}): ${angle}`,
    recentMemories
      ? `Recent Private Memories for ${params.userName} (last 2-3):\n${recentMemories}`
      : `Recent Private Memories for ${params.userName}: None saved yet.`,
    recentChat
      ? `Recent Private Chat Context (last 2-3 turns):\n${recentChat}`
      : 'Recent Private Chat Context: Fresh conversation.',
    'STRICT INSTRUCTIONS FOR THIS OPENING LINE:',
    `1. Greet ${params.userName} spontaneously in 1-2 short, natural spoken sentences right now like a real Bangladeshi close friend.`,
    '2. NEVER use a template, generic, or repetitive greeting (forbidden: "Hey, how can I help you?", "Good morning, ready to start?", "Hi there, nice to see you").',
    '3. Reflect the current time of day, absence duration (sulky oviman if away a while, teasing if late night), and the randomized mood seed naturally.',
    '4. NEVER mention studies, exams, admission prep, books, or study tasks unless the user brings them up first.',
  ].join('\n');
}
