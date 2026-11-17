const LEGACY_HARDCODED_WAKE_SET = new Set([
  'আমি সামিউল / ami samiul / hey tampi',
  'আমি সামিউল',
  'ami samiul',
]);

const LEGACY_HARDCODED_SHUTDOWN_SET = new Set([
  'তুমি এখন বন্ধ হয়ে যাও / বন্ধ হয়ে যাও / শ্যাটডাউন / shutdown / go to sleep',
  'তুমি এখন বন্ধ হয়ে যাও / বন্ধ হয়ে যাও / শ্যাটডাউন / shutdown / go to sleep',
]);

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
  const normalized = normalizeSpeechText(text)
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
  for (const ch of normalized) {
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

export function isLegacyHardcodedWakePhrase(raw?: string | null): boolean {
  const trimmed = (raw ?? '').normalize('NFC').trim().toLowerCase();
  if (!trimmed) return false;
  return LEGACY_HARDCODED_WAKE_SET.has(trimmed);
}

export function isLegacyHardcodedShutdownPhrase(raw?: string | null): boolean {
  const trimmed = (raw ?? '').normalize('NFC').trim().toLowerCase();
  if (!trimmed) return false;
  return LEGACY_HARDCODED_SHUTDOWN_SET.has(trimmed);
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

/**
 * Unlocks Web Audio API on first user gesture if browser autoplay policy requires it.
 */
export function unlockAudioPlayback(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    void ctx.resume().finally(() => {
      window.setTimeout(() => {
        void ctx.close();
      }, 150);
    });
  } catch {
    // Ignore audio context restrictions
  }
}

/**
 * Plays a crisp 1.5-second multi-layered Iron Man / J.A.R.V.I.S. power-up hum + harmonic chime via Web Audio API.
 */
export function playWakeAuthChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    void ctx.resume();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.22, now);
    masterGain.connect(ctx.destination);

    // Layer 1: Deep holographic chamber power-up hum (low-pass filtered sawtooth + sub-sine)
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.setValueAtTime(140, now);
    humFilter.frequency.exponentialRampToValueAtTime(760, now + 0.55);
    humFilter.frequency.exponentialRampToValueAtTime(240, now + 1.45);
    humFilter.Q.value = 3.2;
    humFilter.connect(masterGain);

    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(62, now);
    subOsc.frequency.exponentialRampToValueAtTime(146.83, now + 0.65);
    subOsc.frequency.exponentialRampToValueAtTime(110.0, now + 1.45);
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.42, now + 0.14);
    subGain.gain.setValueAtTime(0.35, now + 0.72);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.48);
    subOsc.connect(subGain);
    subGain.connect(masterGain);
    subOsc.start(now);
    subOsc.stop(now + 1.5);

    const turbineOsc = ctx.createOscillator();
    const turbineGain = ctx.createGain();
    turbineOsc.type = 'sawtooth';
    turbineOsc.frequency.setValueAtTime(92, now);
    turbineOsc.frequency.exponentialRampToValueAtTime(220, now + 0.62);
    turbineOsc.frequency.exponentialRampToValueAtTime(164.81, now + 1.42);
    turbineGain.gain.setValueAtTime(0.001, now);
    turbineGain.gain.linearRampToValueAtTime(0.24, now + 0.18);
    turbineGain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);
    turbineOsc.connect(turbineGain);
    turbineGain.connect(humFilter);
    turbineOsc.start(now);
    turbineOsc.stop(now + 1.48);

    // Layer 2: Telemetry lock-in frequency sweep + ring-lock micro-ticks
    const sweepOsc = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweepOsc.type = 'sine';
    sweepOsc.frequency.setValueAtTime(440, now + 0.04);
    sweepOsc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.34);
    sweepGain.gain.setValueAtTime(0.001, now + 0.04);
    sweepGain.gain.linearRampToValueAtTime(0.45, now + 0.09);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    sweepOsc.connect(sweepGain);
    sweepGain.connect(masterGain);
    sweepOsc.start(now + 0.04);
    sweepOsc.stop(now + 0.4);

    // Layer 3: Harmonic J.A.R.V.I.S. verification chime cascade (D5 -> A5 -> D6 -> F#6 -> A6)
    const playTone = (
      freq: number,
      startOffset: number,
      duration: number,
      peak: number,
      type: OscillatorType = 'sine',
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.linearRampToValueAtTime(peak, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + startOffset + duration,
      );
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    // Rapid ring lock-in blips
    playTone(1318.51, 0.14, 0.07, 0.18, 'triangle');
    playTone(1567.98, 0.24, 0.07, 0.2, 'triangle');
    playTone(1975.53, 0.34, 0.09, 0.22, 'triangle');

    // Resonant activation chord as rings lock into position
    playTone(587.33, 0.38, 0.85, 0.38, 'sine');
    playTone(880.0, 0.42, 0.9, 0.42, 'triangle');
    playTone(1174.66, 0.46, 0.92, 0.48, 'sine');
    playTone(1479.98, 0.52, 0.86, 0.32, 'sine');
    playTone(1760.0, 0.58, 0.85, 0.34, 'sine');
    playTone(2349.32, 0.65, 0.78, 0.18, 'sine');

    window.setTimeout(() => {
      void ctx.close();
    }, 1650);
  } catch {
    // Ignore audio context restrictions if blocked
  }
}

/**
 * Plays a sleek descending sci-fi power-down chime via Web Audio API.
 */
export function playShutdownChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    void ctx.resume();
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.18, now);
    masterGain.connect(ctx.destination);

    // Stage 1: Descending chime cascade (A5 -> E5 -> A4)
    const playStep = (
      freq: number,
      startOffset: number,
      duration: number,
      peak: number,
      type: OscillatorType = 'sine',
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.001, now + startOffset);
      gain.gain.linearRampToValueAtTime(peak, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + startOffset + duration,
      );
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playStep(880.0, 0.0, 0.22, 0.52, 'triangle');
    playStep(659.25, 0.09, 0.26, 0.46, 'sine');
    playStep(440.0, 0.19, 0.38, 0.5, 'sine');

    // Stage 2: Smooth sci-fi core power-down frequency sweep (520Hz -> 130Hz)
    const sweepOsc = ctx.createOscillator();
    const sweepGain = ctx.createGain();
    sweepOsc.type = 'sine';
    sweepOsc.frequency.setValueAtTime(520.0, now + 0.12);
    sweepOsc.frequency.exponentialRampToValueAtTime(130.0, now + 0.62);
    sweepGain.gain.setValueAtTime(0.001, now + 0.12);
    sweepGain.gain.linearRampToValueAtTime(0.45, now + 0.18);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    sweepOsc.connect(sweepGain);
    sweepGain.connect(masterGain);
    sweepOsc.start(now + 0.12);
    sweepOsc.stop(now + 0.67);

    window.setTimeout(() => {
      void ctx.close();
    }, 900);
  } catch {
    // Ignore audio context restrictions if blocked
  }
}
