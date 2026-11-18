import { LanguageCode } from '../types/tampi';

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*>#]+\s+/gm, ' ')
    .replace(/[*_~#`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits long responses into natural sentences (supporting English punctuation
 * and Bengali Dari '।') so browser SpeechSynthesis never cuts off mid-reply.
 */
export function splitIntoSentences(rawText: string): string[] {
  const clean = stripMarkdownForSpeech(rawText);
  if (!clean) return [];

  const chunks: string[] = [];
  let current = '';

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    current += ch;

    const isTerminator =
      ch === '.' || ch === '!' || ch === '?' || ch === '।' || ch === '\n';

    if (isTerminator) {
      const prevChar = i > 0 ? clean[i - 1] : '';
      const nextChar = i + 1 < clean.length ? clean[i + 1] : '';
      // Avoid splitting decimals like 3.14 or abbreviations mid-token
      const isDecimal = ch === '.' && /\d/.test(prevChar) && /\d/.test(nextChar);

      if (!isDecimal && current.trim().length > 0) {
        chunks.push(current.trim());
        current = '';
      }
    }
  }

  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  // Merge tiny 1-2 word fragments into previous chunk for smoother prosody
  const merged: string[] = [];
  for (const chunk of chunks) {
    if (merged.length > 0 && chunk.length < 10) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${chunk}`;
    } else {
      merged.push(chunk);
    }
  }

  return merged;
}

/**
 * Ranks available SpeechSynthesis voices to pick the most natural Bengali or
 * English voice automatically.
 */
export function selectBestVoice(
  voices: SpeechSynthesisVoice[],
  lang: LanguageCode,
  preferredURI?: string,
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  if (preferredURI) {
    const exact = voices.find((v) => v.voiceURI === preferredURI);
    if (exact) return exact;
  }

  const scoreVoice = (voice: SpeechSynthesisVoice): number => {
    const name = voice.name.toLowerCase();
    const vLang = voice.lang.toLowerCase();
    let score = 0;

    if (lang === 'bn-BD') {
      if (vLang === 'bn-bd') score += 100;
      else if (vLang.startsWith('bn')) score += 80;
      else return -1;

      if (name.includes('nabanita')) score += 60;
      if (name.includes('pradeep')) score += 55;
      if (name.includes('tanishaa')) score += 50;
      if (name.includes('natural') || name.includes('online')) score += 40;
      if (name.includes('microsoft')) score += 30;
      if (name.includes('google')) score += 25;
    } else {
      if (vLang === 'en-us') score += 100;
      else if (vLang.startsWith('en')) score += 75;
      else return -1;

      if (name.includes('natural') || name.includes('online')) score += 45;
      if (name.includes('aria') || name.includes('jenny') || name.includes('guy')) {
        score += 40;
      }
      if (name.includes('google us english')) score += 38;
      if (name.includes('samantha') || name.includes('daniel')) score += 30;
      if (name.includes('microsoft')) score += 20;
    }

    if (voice.localService) score += 5;
    return score;
  };

  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;

  for (const voice of voices) {
    const s = scoreVoice(voice);
    if (s > bestScore) {
      bestScore = s;
      best = voice;
    }
  }

  return best ?? voices.find((v) => v.default) ?? voices[0] ?? null;
}

export interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onaudioend?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onsoundend?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
}

export interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      length?: number;
      isFinal: boolean;
      [altIndex: number]: { transcript: string };
    };
  };
}

export function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionInstance)
  | null {
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}
