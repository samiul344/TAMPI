export function normalizeSpeechText(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u200c\u200d]/g, '')
    .replace(/[.,!?।;:'"()[\]{}\-–—…~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BENGALI_CHAR_MAP: Record<string, string> = {
  // Independent vowels
  'অ': 'o',
  'আ': 'a',
  'ই': 'i',
  'ঈ': 'i',
  'উ': 'u',
  'ঊ': 'u',
  'ঋ': 'ri',
  'এ': 'e',
  'ঐ': 'oi',
  'ও': 'o',
  'ঔ': 'ou',
  // Vowel signs (kars)
  'া': 'a',
  'ি': 'i',
  'ী': 'i',
  'ু': 'u',
  'ূ': 'u',
  'ৃ': 'ri',
  'ে': 'e',
  'ৈ': 'oi',
  'ো': 'o',
  'ৌ': 'ou',
  // Consonants & modifiers
  'ক': 'k',
  'খ': 'k',
  'গ': 'g',
  'ঘ': 'g',
  'ঙ': 'ng',
  'চ': 'c',
  'ছ': 'c',
  'জ': 'j',
  'ঝ': 'j',
  'ঞ': 'n',
  'ট': 't',
  'ঠ': 't',
  'ড': 'd',
  'ঢ': 'd',
  'ণ': 'n',
  'ত': 't',
  'থ': 't',
  'দ': 'd',
  'ধ': 'd',
  'ন': 'n',
  'প': 'p',
  'ফ': 'f',
  'ব': 'b',
  'ভ': 'b',
  'ম': 'm',
  'য': 'j',
  'র': 'r',
  'ল': 'l',
  'শ': 's',
  'ষ': 's',
  'স': 's',
  'হ': 'h',
  'ড়': 'r',
  'ঢ়': 'r',
  'য়': 'y',
  'ৎ': 't',
  'ং': 'ng',
  'ঃ': 'h',
  'ঁ': '',
  '্': '',
};

/**
 * Converts Bengali Unicode OR English/Banglish text into a unified lowercase
 * phonetic skeleton so cross-script speech recognition matches reliably.
 */
export function toPhoneticRoman(text: string): string {
  const normalized = normalizeSpeechText(text);

  const deconstructed = normalized
    // NFC decomposes ড়, ঢ়, য় into base + \u09bc (nukta); normalize both forms first
    .replace(/\u09A1\u09BC/g, 'r')
    .replace(/\u09A2\u09BC/g, 'r')
    .replace(/\u09AF\u09BC/g, 'y')
    .replace(/ড়/g, 'r')
    .replace(/ঢ়/g, 'r')
    .replace(/য়/g, 'y')
    // Special common conjuncts before per-char mapping
    .replace(/ক্ষ/g, 'kh')
    .replace(/জ্ঞ/g, 'g')
    .replace(/্য/g, 'e')
    .replace(/্ব/g, 'o');

  let latin = '';
  for (const ch of deconstructed) {
    if (ch in BENGALI_CHAR_MAP) {
      latin += BENGALI_CHAR_MAP[ch];
    } else {
      latin += ch;
    }
  }

  return latin
    .replace(/ph/g, 'f')
    .replace(/bh/g, 'b')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/jh/g, 'j')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c')
    .replace(/q/g, 'k')
    .replace(/v/g, 'b')
    .replace(/w/g, 'o')
    .replace(/z/g, 'j')
    .replace(/x/g, 'ks')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/([a-z]{2,})e\b/g, '$1')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toVowelNeutralSkeleton(phonetic: string): string {
  return phonetic
    .replace(/[aeiouy]+/g, 'a')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a[i - 1];
    for (let j = 1; j <= n; j++) {
      const cost = ca === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

function fuzzyWordWindowMatches(
  transcriptPhonetic: string,
  phrasePhonetic: string,
  minSimilarity = 0.78,
): boolean {
  const phraseCompact = phrasePhonetic.replace(/\s+/g, '');
  if (phraseCompact.length < 4) return false;

  const tWords = transcriptPhonetic.split(' ').filter(Boolean);
  const pWords = phrasePhonetic.split(' ').filter(Boolean);
  if (tWords.length === 0 || pWords.length === 0) return false;

  const minWindow = Math.max(1, pWords.length - 1);
  const maxWindow = Math.min(tWords.length, pWords.length + 1);

  for (let wLen = minWindow; wLen <= maxWindow; wLen++) {
    for (let start = 0; start <= tWords.length - wLen; start++) {
      const candidateCompact = tWords.slice(start, start + wLen).join('');
      const maxLen = Math.max(candidateCompact.length, phraseCompact.length);
      const minLen = Math.min(candidateCompact.length, phraseCompact.length);
      if (minLen / maxLen < 0.68) continue;

      const dist = levenshteinDistance(candidateCompact, phraseCompact);
      const similarity = 1 - dist / maxLen;
      if (similarity >= minSimilarity) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Splits comma-, slash-, pipe-, or newline-separated phrases cleanly,
 * returning trimmed, lowercase normalized phrases with ZERO hardcoded fallbacks.
 */
export function parseVoicePhraseList(raw?: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,/\n|]+/)) {
    const normalized = normalizeSpeechText(part);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

/**
 * Matches spoken transcript against an explicit list of user-configured phrases
 * using exact normalized substring + bilingual Bengali/Banglish phonetic & fuzzy matching.
 * Never falls back to any hardcoded wake or shutdown phrases.
 */
export function matchesPhraseList(
  transcript: string,
  phrases: string[],
): boolean {
  if (!phrases || phrases.length === 0) return false;
  const normalizedTranscript = normalizeSpeechText(transcript);
  if (!normalizedTranscript) return false;

  const transcriptPhonetic = toPhoneticRoman(normalizedTranscript);
  const transcriptPhoneticCompact = transcriptPhonetic.replace(/\s+/g, '');
  const transcriptNeutral = toVowelNeutralSkeleton(transcriptPhonetic);
  const transcriptNeutralCompact = transcriptNeutral.replace(/\s+/g, '');

  for (const rawPhrase of phrases) {
    const phrase = normalizeSpeechText(rawPhrase);
    if (!phrase) continue;

    // 1. Exact normalized match
    if (normalizedTranscript.includes(phrase)) {
      return true;
    }

    // 2. Bilingual phonetic match (Bengali <-> Banglish cross-script)
    const phrasePhonetic = toPhoneticRoman(phrase);
    if (phrasePhonetic) {
      if (transcriptPhonetic.includes(phrasePhonetic)) {
        return true;
      }
      const phraseCompact = phrasePhonetic.replace(/\s+/g, '');
      if (
        phraseCompact.length >= 4 &&
        transcriptPhoneticCompact.includes(phraseCompact)
      ) {
        return true;
      }

      // 3. Fuzzy sliding-window similarity for minor speech recognition variances
      if (fuzzyWordWindowMatches(transcriptPhonetic, phrasePhonetic, 0.78)) {
        return true;
      }

      // 4. Cross-script English/Bengali vowel-neutralized match (for >= 5 phonetic chars, >= 2 consonants)
      const phraseConsonants = phraseCompact.replace(/[aeiouy]/g, '');
      if (phraseCompact.length >= 5 && phraseConsonants.length >= 2) {
        const phraseNeutral = toVowelNeutralSkeleton(phrasePhonetic);
        const phraseNeutralCompact = phraseNeutral.replace(/\s+/g, '');
        if (
          phraseNeutralCompact.length >= 4 &&
          (transcriptNeutral.includes(phraseNeutral) ||
            transcriptNeutralCompact.includes(phraseNeutralCompact) ||
            fuzzyWordWindowMatches(transcriptNeutral, phraseNeutral, 0.82))
        ) {
          return true;
        }
      }
    }
  }

  return false;
}

const ADDRESS_WORDS_EXACT = new Set([
  'tampi',
  'tempi',
  'tampy',
  'tambi',
  'tumpi',
  'tompi',
  'tommy',
  'please',
  'plz',
  'pls',
  'hey',
  'hi',
  'hello',
  'ok',
  'okay',
  'okey',
  'dear',
  'friend',
  'buddy',
  'bro',
  'sis',
  'now',
  'listen',
  'sorry',
  'thanks',
  'thank',
  'ei',
  'oye',
  'shono',
  'suno',
  'ekhon',
  'akhon',
  'dost',
  'bondhu',
  'bhai',
  'vai',
  'apu',
  'janu',
  'baby',
  'টাম্পি',
  'তাম্পি',
  'তাম্মি',
  'ট্যাম্পি',
  'প্লিজ',
  'ওকে',
  'এই',
  'ওহে',
  'শোনো',
  'শোন',
  'এখন',
  'বন্ধু',
  'দোস্ত',
  'ভাই',
  'আপু',
]);

const ADDRESS_WORDS_PHONETIC = new Set([
  'tampi',
  'tempi',
  'tambi',
  'tumpi',
  'tompi',
  'tami',
  'pleas',
  'plis',
  'plij',
  'plj',
  'pls',
  'hei',
  'hi',
  'helo',
  'ok',
  'oke',
  'okay',
  'okey',
  'dir',
  'frend',
  'badi',
  'bro',
  'sis',
  'nao',
  'lisen',
  'sori',
  'tanks',
  'tank',
  'ei',
  'oye',
  'sono',
  'suno',
  'ekon',
  'akon',
  'dost',
  'bondu',
  'bai',
  'apu',
  'janu',
  'bebi',
]);

function isStandaloneAddressWord(word: string): boolean {
  const norm = normalizeSpeechText(word);
  if (!norm || norm.includes(' ')) return false;
  if (ADDRESS_WORDS_EXACT.has(norm)) return true;

  const phonetic = toPhoneticRoman(norm);
  if (!phonetic) return false;
  if (ADDRESS_WORDS_PHONETIC.has(phonetic)) return true;

  if (
    phonetic.length >= 4 &&
    (levenshteinDistance(phonetic, 'tampi') <= 1 ||
      levenshteinDistance(phonetic, 'pleas') <= 1)
  ) {
    return true;
  }

  return false;
}

function matchesSingleStandaloneUtterance(
  normalizedCandidate: string,
  normalizedPhrase: string,
): boolean {
  if (!normalizedCandidate || !normalizedPhrase) return false;

  // 1. Exact full-utterance match
  if (normalizedCandidate === normalizedPhrase) {
    return true;
  }

  const candPhonetic = toPhoneticRoman(normalizedCandidate);
  const phrasePhonetic = toPhoneticRoman(normalizedPhrase);
  if (!candPhonetic || !phrasePhonetic) return false;

  const candCompact = candPhonetic.replace(/\s+/g, '');
  const phraseCompact = phrasePhonetic.replace(/\s+/g, '');
  if (!candCompact || !phraseCompact) return false;

  // 2. Full-utterance phonetic equality (also handles compound split/join like "shut down" vs "shutdown")
  if (candCompact === phraseCompact) {
    return true;
  }

  const candWords = candPhonetic.split(' ').filter(Boolean);
  const phraseWords = phrasePhonetic.split(' ').filter(Boolean);

  // 3. Full-utterance fuzzy match (same word count only, never substring)
  if (candWords.length === phraseWords.length && phraseCompact.length >= 4) {
    const maxLen = Math.max(candCompact.length, phraseCompact.length);
    const minLen = Math.min(candCompact.length, phraseCompact.length);
    if (minLen / maxLen >= 0.75) {
      const dist = levenshteinDistance(candCompact, phraseCompact);
      const similarity = 1 - dist / maxLen;
      if (similarity >= 0.84) {
        return true;
      }
    }

    // 4. Cross-script Bengali/Banglish full-utterance vowel-neutralized match
    const phraseConsonants = phraseCompact.replace(/[aeiouy]/g, '');
    if (phraseCompact.length >= 5 && phraseConsonants.length >= 2) {
      const candNeutralCompact = toVowelNeutralSkeleton(candPhonetic).replace(
        /\s+/g,
        '',
      );
      const phraseNeutralCompact = toVowelNeutralSkeleton(
        phrasePhonetic,
      ).replace(/\s+/g, '');
      if (
        phraseNeutralCompact.length >= 4 &&
        candNeutralCompact === phraseNeutralCompact
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Strictly matches an utterance as a standalone command against the user's saved phrases.
 * After trimming whitespace & punctuation, the utterance must match one of the phrases
 * either directly or with at most 1 extra leading/trailing address word (e.g. "tampi" or "please").
 * Never triggers if the phrase merely appears inside a longer conversational sentence.
 */
export function matchesStandalonePhraseList(
  transcript: string,
  phrases: string[],
): boolean {
  if (!phrases || phrases.length === 0) return false;
  const normalizedTranscript = normalizeSpeechText(transcript);
  if (!normalizedTranscript) return false;

  const tWords = normalizedTranscript.split(' ').filter(Boolean);
  if (tWords.length === 0) return false;

  for (const rawPhrase of phrases) {
    const phrase = normalizeSpeechText(rawPhrase);
    if (!phrase) continue;

    // 0 extra words: entire trimmed utterance matches the command
    if (matchesSingleStandaloneUtterance(normalizedTranscript, phrase)) {
      return true;
    }

    // At most 1 extra address word at the start OR end (e.g. "tampi <cmd>" or "<cmd> please")
    if (tWords.length >= 2) {
      const firstWord = tWords[0];
      if (isStandaloneAddressWord(firstWord)) {
        const withoutFirst = tWords.slice(1).join(' ');
        if (matchesSingleStandaloneUtterance(withoutFirst, phrase)) {
          return true;
        }
      }

      const lastWord = tWords[tWords.length - 1];
      if (isStandaloneAddressWord(lastWord)) {
        const withoutLast = tWords.slice(0, -1).join(' ');
        if (matchesSingleStandaloneUtterance(withoutLast, phrase)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function matchesPhrase(
  transcript: string,
  phrase: string,
): boolean {
  return matchesPhraseList(transcript, parseVoicePhraseList(phrase));
}

export function matchesStandalonePhrase(
  transcript: string,
  phrase: string,
): boolean {
  return matchesStandalonePhraseList(transcript, parseVoicePhraseList(phrase));
}

export function matchesWakePhrase(
  transcript: string,
  secretWakePhrase: string,
): boolean {
  return matchesPhraseList(transcript, parseVoicePhraseList(secretWakePhrase));
}

export function matchesShutdownPhrase(
  transcript: string,
  secretShutdownPhrase: string,
): boolean {
  return matchesStandalonePhraseList(
    transcript,
    parseVoicePhraseList(secretShutdownPhrase),
  );
}

let sharedOutputCtx: AudioContext | null = null;
let pendingGestureResumeCleanup: (() => void) | null = null;

function createOutputAudioContext(): AudioContext | null {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    return new AudioCtx({ sampleRate: 24000 });
  } catch {
    return new AudioCtx();
  }
}

export function scheduleAudioContextResumeOnGesture(
  onResumed?: () => void,
): void {
  if (typeof window === 'undefined') return;
  if (sharedOutputCtx && sharedOutputCtx.state === 'running') {
    onResumed?.();
    return;
  }
  if (pendingGestureResumeCleanup) {
    pendingGestureResumeCleanup();
    pendingGestureResumeCleanup = null;
  }

  const attemptResume = () => {
    if (!sharedOutputCtx || sharedOutputCtx.state === 'closed') {
      sharedOutputCtx = createOutputAudioContext();
    }
    const ctx = sharedOutputCtx;
    if (!ctx) return;
    void ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') {
          cleanup();
          onResumed?.();
        }
      })
      .catch(() => {
        // Ignore until a valid gesture occurs
      });
  };

  const cleanup = () => {
    window.removeEventListener('pointerdown', attemptResume, true);
    window.removeEventListener('keydown', attemptResume, true);
    window.removeEventListener('touchstart', attemptResume, true);
    if (pendingGestureResumeCleanup === cleanup) {
      pendingGestureResumeCleanup = null;
    }
  };

  pendingGestureResumeCleanup = cleanup;
  window.addEventListener('pointerdown', attemptResume, { capture: true, passive: true });
  window.addEventListener('keydown', attemptResume, { capture: true, passive: true });
  window.addEventListener('touchstart', attemptResume, { capture: true, passive: true });
}

/**
 * Acquires (or creates) a shared 24kHz output AudioContext and ensures it is resumed & unlocked.
 */
export async function acquireUnlockedOutputAudioContext(): Promise<AudioContext> {
  if (!sharedOutputCtx || sharedOutputCtx.state === 'closed') {
    sharedOutputCtx = createOutputAudioContext();
  }
  if (!sharedOutputCtx) {
    throw new Error('Web Audio API is not supported in this browser.');
  }
  if (sharedOutputCtx.state === 'suspended') {
    try {
      await sharedOutputCtx.resume();
    } catch {
      // Ignore if resume needs a gesture; silent buffer prime + gesture hook below handles it
    }
    if (sharedOutputCtx.state === 'suspended') {
      scheduleAudioContextResumeOnGesture();
    }
  }
  return sharedOutputCtx;
}

/**
 * Unlocks Web Audio API immediately on user gesture or wake-up so browser autoplay policy never silences output.
 */
export function unlockAudioPlayback(): void {
  try {
    if (!sharedOutputCtx || sharedOutputCtx.state === 'closed') {
      sharedOutputCtx = createOutputAudioContext();
    }
    if (!sharedOutputCtx) return;
    const ctx = sharedOutputCtx;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {
        scheduleAudioContextResumeOnGesture();
      });
    }
    const silentBuffer = ctx.createBuffer(1, 1, ctx.sampleRate || 24000);
    const src = ctx.createBufferSource();
    src.buffer = silentBuffer;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // Ignore audio context restrictions
  }
}

function getOrInitPlaybackContext(): {
  ctx: AudioContext;
  ephemeral: boolean;
} | null {
  if (sharedOutputCtx && sharedOutputCtx.state !== 'closed') {
    if (sharedOutputCtx.state === 'suspended') {
      void sharedOutputCtx.resume().catch(() => {});
    }
    return { ctx: sharedOutputCtx, ephemeral: false };
  }
  const created = createOutputAudioContext();
  if (!created) return null;
  sharedOutputCtx = created;
  if (sharedOutputCtx.state === 'suspended') {
    void sharedOutputCtx.resume().catch(() => {});
  }
  return { ctx: sharedOutputCtx, ephemeral: false };
}

function createMasterSfxBus(
  ctx: AudioContext,
  level: number,
  now: number,
): { input: GainNode; dispose: () => void } {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-14, now);
  compressor.knee.setValueAtTime(18, now);
  compressor.ratio.setValueAtTime(4, now);
  compressor.attack.setValueAtTime(0.004, now);
  compressor.release.setValueAtTime(0.18, now);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(level, now);

  const dry = ctx.createGain();
  dry.gain.setValueAtTime(0.88, now);

  const delay = ctx.createDelay(0.5);
  delay.delayTime.setValueAtTime(0.115, now);

  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.setValueAtTime(2800, now);

  const feedback = ctx.createGain();
  feedback.gain.setValueAtTime(0.24, now);

  const wet = ctx.createGain();
  wet.gain.setValueAtTime(0.28, now);

  masterGain.connect(dry);
  dry.connect(compressor);

  masterGain.connect(delay);
  delay.connect(delayFilter);
  delayFilter.connect(feedback);
  feedback.connect(delay);
  delayFilter.connect(wet);
  wet.connect(compressor);

  compressor.connect(ctx.destination);

  return {
    input: masterGain,
    dispose: () => {
      try {
        masterGain.disconnect();
        dry.disconnect();
        delay.disconnect();
        delayFilter.disconnect();
        feedback.disconnect();
        wet.disconnect();
        compressor.disconnect();
      } catch {
        // ignore disconnect errors
      }
    },
  };
}

function connectWithPan(
  ctx: AudioContext,
  source: AudioNode,
  dest: AudioNode,
  panValue: number,
  now: number,
): void {
  if (typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), now);
    source.connect(panner);
    panner.connect(dest);
  } else {
    source.connect(dest);
  }
}

function createNoiseAirBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const sampleRate = ctx.sampleRate || 24000;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    // Soft pink-ish tilt for silky holographic air texture
    last = (last + 0.08 * white) / 1.08;
    data[i] = last * 2.6 + white * 0.25;
  }
  return buffer;
}

/**
 * Plays a crisp 0.5-second subtle Stark HUD charging / neural-link crystal shimmer
 * right before Tampi begins speaking her opening line.
 */
export function playPreSpeechHudSfx(): void {
  try {
    const resolved = getOrInitPlaybackContext();
    if (!resolved) return;
    const { ctx } = resolved;
    const now = ctx.currentTime + 0.01;

    const bus = createMasterSfxBus(ctx, 0.2, now);

    // 1. Silky 0.42s holographic air shimmer
    const airSrc = ctx.createBufferSource();
    airSrc.buffer = createNoiseAirBuffer(ctx, 0.45);
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.Q.value = 3.8;
    airFilter.frequency.setValueAtTime(650, now);
    airFilter.frequency.exponentialRampToValueAtTime(2800, now + 0.34);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.001, now);
    airGain.gain.linearRampToValueAtTime(0.18, now + 0.09);
    airGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    airSrc.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(bus.input);
    airSrc.start(now);
    airSrc.stop(now + 0.44);

    // 2. Smooth neural capacitor sweep (360Hz -> 1140Hz)
    const chargeOsc = ctx.createOscillator();
    const chargeGain = ctx.createGain();
    chargeOsc.type = 'sine';
    chargeOsc.frequency.setValueAtTime(360, now);
    chargeOsc.frequency.exponentialRampToValueAtTime(1140, now + 0.32);
    chargeGain.gain.setValueAtTime(0.001, now);
    chargeGain.gain.linearRampToValueAtTime(0.28, now + 0.07);
    chargeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    chargeOsc.connect(chargeGain);
    chargeGain.connect(bus.input);
    chargeOsc.start(now);
    chargeOsc.stop(now + 0.42);

    // 3. Crystalline dual stereo telemetry ping (A5 -> E6)
    const ping = (
      freq: number,
      offset: number,
      dur: number,
      peak: number,
      pan: number,
    ) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + offset);
      g.gain.setValueAtTime(0.001, now + offset);
      g.gain.linearRampToValueAtTime(peak, now + offset + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      osc.connect(g);
      connectWithPan(ctx, g, bus.input, pan, now);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.02);
    };

    ping(880.0, 0.14, 0.22, 0.24, -0.25);
    ping(1318.51, 0.24, 0.24, 0.26, 0.25);

    window.setTimeout(() => {
      bus.dispose();
    }, 950);
  } catch {
    // Ignore audio context restrictions
  }
}

/**
 * Plays a multi-stage theatrical Iron Man / J.A.R.V.I.S. / F.R.I.D.A.Y.
 * suit-up & holographic neural-core activation soundscape.
 */
export function playWakeAuthChime(): void {
  try {
    const resolved = getOrInitPlaybackContext();
    if (!resolved) return;
    const { ctx } = resolved;
    const now = ctx.currentTime + 0.01;

    const bus = createMasterSfxBus(ctx, 0.34, now);

    // Layer 1: Arc-reactor sub-bass ignition thump (142Hz -> 44Hz)
    const subThump = ctx.createOscillator();
    const subThumpGain = ctx.createGain();
    subThump.type = 'sine';
    subThump.frequency.setValueAtTime(142, now);
    subThump.frequency.exponentialRampToValueAtTime(44, now + 0.34);
    subThumpGain.gain.setValueAtTime(0.001, now);
    subThumpGain.gain.linearRampToValueAtTime(0.55, now + 0.025);
    subThumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    subThump.connect(subThumpGain);
    subThumpGain.connect(bus.input);
    subThump.start(now);
    subThump.stop(now + 0.44);

    // Layer 2: Holographic glass materialization air-whoosh (resonant sweeping noise)
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = createNoiseAirBuffer(ctx, 0.85);
    const airBand = ctx.createBiquadFilter();
    airBand.type = 'bandpass';
    airBand.Q.value = 4.6;
    airBand.frequency.setValueAtTime(260, now + 0.02);
    airBand.frequency.exponentialRampToValueAtTime(3400, now + 0.38);
    airBand.frequency.exponentialRampToValueAtTime(920, now + 0.78);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.001, now + 0.02);
    airGain.gain.linearRampToValueAtTime(0.32, now + 0.16);
    airGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    noiseSrc.connect(airBand);
    airBand.connect(airGain);
    airGain.connect(bus.input);
    noiseSrc.start(now + 0.02);
    noiseSrc.stop(now + 0.82);

    // Layer 3: Deep Stark reactor turbine rise (warm low-passed sawtooth + sub harmonic)
    const reactorFilter = ctx.createBiquadFilter();
    reactorFilter.type = 'lowpass';
    reactorFilter.frequency.setValueAtTime(180, now);
    reactorFilter.frequency.exponentialRampToValueAtTime(1450, now + 0.48);
    reactorFilter.frequency.exponentialRampToValueAtTime(420, now + 1.15);
    reactorFilter.Q.value = 2.8;
    reactorFilter.connect(bus.input);

    const turbineOsc = ctx.createOscillator();
    const turbineGain = ctx.createGain();
    turbineOsc.type = 'sawtooth';
    turbineOsc.frequency.setValueAtTime(73.42, now + 0.03); // D2
    turbineOsc.frequency.exponentialRampToValueAtTime(146.83, now + 0.42); // D3
    turbineOsc.frequency.exponentialRampToValueAtTime(110.0, now + 1.12);
    turbineGain.gain.setValueAtTime(0.001, now + 0.03);
    turbineGain.gain.linearRampToValueAtTime(0.22, now + 0.14);
    turbineGain.gain.exponentialRampToValueAtTime(0.001, now + 1.14);
    turbineOsc.connect(turbineGain);
    turbineGain.connect(reactorFilter);
    turbineOsc.start(now + 0.03);
    turbineOsc.stop(now + 1.16);

    // Layer 4: HUD stereo reticle targeting chirps (pan alternating left/right)
    const playChirp = (
      freq: number,
      offset: number,
      dur: number,
      peak: number,
      pan: number,
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + offset);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + offset + dur);
      gain.gain.setValueAtTime(0.001, now + offset);
      gain.gain.linearRampToValueAtTime(peak, now + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      osc.connect(gain);
      connectWithPan(ctx, gain, bus.input, pan, now);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.015);
    };

    playChirp(1318.51, 0.09, 0.055, 0.16, -0.55); // E6 L
    playChirp(1760.0, 0.16, 0.055, 0.18, 0.55); // A6 R
    playChirp(2349.32, 0.23, 0.06, 0.2, -0.35); // D7 L
    playChirp(2959.96, 0.3, 0.075, 0.22, 0.35); // F#7 R

    // Layer 5: Lush detuned J.A.R.V.I.S. Lydian activation chord (D5 - A5 - E6 - F#6)
    const chordFilter = ctx.createBiquadFilter();
    chordFilter.type = 'lowpass';
    chordFilter.frequency.setValueAtTime(4200, now + 0.32);
    chordFilter.frequency.exponentialRampToValueAtTime(1600, now + 1.25);
    chordFilter.connect(bus.input);

    const playDetunedNote = (
      freq: number,
      offset: number,
      dur: number,
      peak: number,
      pan: number,
    ) => {
      for (const detuneCents of [-7, 7]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = detuneCents < 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + offset);
        osc.detune.setValueAtTime(detuneCents, now + offset);
        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.linearRampToValueAtTime(peak * 0.55, now + offset + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
        osc.connect(gain);
        connectWithPan(
          ctx,
          gain,
          chordFilter,
          detuneCents < 0 ? pan - 0.18 : pan + 0.18,
          now,
        );
        osc.start(now + offset);
        osc.stop(now + offset + dur + 0.02);
      }
    };

    playDetunedNote(587.33, 0.34, 0.85, 0.28, 0); // D5
    playDetunedNote(880.0, 0.38, 0.88, 0.3, -0.2); // A5
    playDetunedNote(1318.51, 0.42, 0.9, 0.28, 0.2); // E6 (add9 shimmer)
    playDetunedNote(1479.98, 0.47, 0.85, 0.22, 0); // F#6

    window.setTimeout(() => {
      bus.dispose();
    }, 1850);
  } catch {
    // Ignore audio context restrictions if blocked
  }
}

/**
 * Plays a sleek spatial descending sci-fi power-down chime via Web Audio API.
 */
export function playShutdownChime(): void {
  try {
    const resolved = getOrInitPlaybackContext();
    if (!resolved) return;
    const { ctx } = resolved;
    const now = ctx.currentTime + 0.01;

    const bus = createMasterSfxBus(ctx, 0.24, now);

    const playStep = (
      freq: number,
      startOffset: number,
      duration: number,
      peak: number,
      pan: number,
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.linearRampToValueAtTime(peak, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + startOffset + duration,
      );
      osc.connect(gain);
      connectWithPan(ctx, gain, bus.input, pan, now);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playStep(1174.66, 0.0, 0.22, 0.34, 0.3);
    playStep(880.0, 0.09, 0.26, 0.34, -0.25);
    playStep(587.33, 0.19, 0.42, 0.38, 0);

    const sweepOsc = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweepOsc.type = 'sine';
    sweepOsc.frequency.setValueAtTime(520.0, now + 0.1);
    sweepOsc.frequency.exponentialRampToValueAtTime(95.0, now + 0.68);
    sweepGain.gain.setValueAtTime(0.001, now + 0.1);
    sweepGain.gain.linearRampToValueAtTime(0.38, now + 0.16);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    sweepOsc.connect(sweepGain);
    sweepGain.connect(bus.input);
    sweepOsc.start(now + 0.1);
    sweepOsc.stop(now + 0.72);

    window.setTimeout(() => {
      bus.dispose();
    }, 1250);
  } catch {
    // Ignore audio context restrictions if blocked
  }
}
