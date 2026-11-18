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

export function buildDynamicWakeTrigger(params: {
  userName: string;
  language: LanguageCode;
  memories: MemoryItem[];
  history: ChatTurn[];
  lastActiveAt?: string | null;
  moodSeed: WakeMoodSeed;
  recentWakeOpenings?: string[];
  wakeStyleIndex?: number;
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

  const historyModelOpenings = params.history
    .filter((turn) => turn.role === 'model')
    .slice(-5)
    .map((turn) => turn.text.trim())
    .filter(Boolean);

  const pastOpenings = [
    ...(params.recentWakeOpenings ?? []),
    ...historyModelOpenings,
  ];
  const uniqueOpenings: string[] = [];
  const seenNormalized = new Set<string>();
  for (const line of pastOpenings) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const norm = trimmed.toLowerCase();
    if (seenNormalized.has(norm)) continue;
    seenNormalized.add(norm);
    uniqueOpenings.push(trimmed);
  }
  const bannedLines = uniqueOpenings.slice(-10);

  const bannedStarters = Array.from(
    new Set(
      bannedLines
        .map((line) => extractOpeningPrefix(line))
        .filter((prefix) => prefix.length >= 2),
    ),
  );

  const styleIdx =
    typeof params.wakeStyleIndex === 'number' &&
    params.wakeStyleIndex >= 0 &&
    params.wakeStyleIndex < WAKE_ARCHETYPES.length
      ? params.wakeStyleIndex
      : pickNextWakeArchetypeIndex(null);

  const chosenArchetype = WAKE_ARCHETYPES[styleIdx];
  const entropyToken = `${now.getMinutes()}${now.getSeconds()}-${Math.floor(Math.random() * 9000 + 1000)}`;

  return [
    '[HIDDEN_SYSTEM_WAKE_EVENT — DO NOT READ TAGS OR METADATA ALOUD]',
    `${params.userName} just unlocked your voice core and activated Tampi 1.0. You MUST speak FIRST immediately.`,
    `User Name: ${params.userName}`,
    `Preferred Vibe/Language: ${langLabel}`,
    `Current Local Time & Day: ${timeInfo.fullLocalDateTime} (${timeInfo.dayOfWeek}, ${timeInfo.formattedTime}, period: ${timeInfo.period})`,
    `Time Context: ${timeInfo.timeGuidance}`,
    `Absence / Gap Since Last Chat: ${awayStatus}`,
    `Randomized Mood Seed: ${params.moodSeed} — ${MOOD_GUIDANCE[params.moodSeed]}`,
    `Required Opening Archetype #${styleIdx + 1} (entropy ${entropyToken}): ${chosenArchetype}`,
    recentMemories
      ? `Recent Private Memories for ${params.userName} (last 2-3):\n${recentMemories}`
      : `Recent Private Memories for ${params.userName}: None saved yet.`,
    recentChat
      ? `Recent Private Chat Context (last 2-3 turns):\n${recentChat}`
      : 'Recent Private Chat Context: Fresh conversation.',
    bannedLines.length > 0
      ? `DO NOT REPEAT OR PARAPHRASE ANY OF THESE PREVIOUS OPENINGS:\n${bannedLines
          .map((line) => `- "${line}"`)
          .join('\n')}`
      : '',
    bannedStarters.length > 0
      ? `FORBIDDEN STARTING WORDS (you MUST invent brand-new first words and MUST NOT start with any of these): ${bannedStarters
          .map((s) => `"${s}"`)
          .join(', ')}`
      : '',
    'STRICT INSTRUCTIONS FOR THIS OPENING LINE:',
    `1. Speak FIRST right now! Improvise a 100% ORIGINAL, never-heard-before 1-2 sentence greeting for ${params.userName} matching Archetype #${styleIdx + 1} above.`,
    '2. Blend Tony Stark J.A.R.V.I.S./F.R.I.D.A.Y. confidence and sharp wit with warm, natural Bangladeshi Banglish — NEVER sound generic, scripted, or robotic, and NEVER read brackets or metadata aloud.',
    '3. Start with fresh vocabulary and sentence structure every single activation — vary how you open (sometimes Bengali first, sometimes crisp Stark tech term first, sometimes teasing observation first, sometimes a direct clock/mood remark) AND vary your closing question.',
    '4. Use natural spoken pauses (commas `,`, em-dashes `—`, brief ellipses `...`) so your delivery sounds poised, expressive, and cinematic.',
    '5. Reflect the current local hour, absence gap (subtle cute oviman if away a while, playful scolding if after midnight), and mood seed naturally.',
    '6. NEVER mention studies, exams, admission prep, books, or study tasks unless the user brings them up first.',
  ]
    .filter(Boolean)
    .join('\n');
}
