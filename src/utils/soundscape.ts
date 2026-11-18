import { LanguageCode } from '../types/tampi';
import { selectBestVoice } from './speech';
import {
  acquireUnlockedOutputAudioContext,
  scheduleAudioContextResumeOnGesture,
  unlockAudioPlayback,
} from './wakeWord';

interface FocusHumState {
  running: boolean;
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  oscNodes: OscillatorNode[];
  lfoNode: OscillatorNode | null;
  noiseNode: AudioBufferSourceNode | null;
  extraNodes: AudioNode[];
  cleanupTimer: number | null;
  stateChangeHandler: (() => void) | null;
}

const focusHumState: FocusHumState = {
  running: false,
  ctx: null,
  masterGain: null,
  oscNodes: [],
  lfoNode: null,
  noiseNode: null,
  extraNodes: [],
  cleanupTimer: null,
  stateChangeHandler: null,
};

const focusHumListeners = new Set<(active: boolean) => void>();

export function subscribeFocusHumState(
  listener: (active: boolean) => void,
): () => void {
  focusHumListeners.add(listener);
  return () => {
    focusHumListeners.delete(listener);
  };
}

function notifyFocusHumListeners(): void {
  for (const cb of focusHumListeners) {
    cb(focusHumState.running);
  }
}

export function isFocusHumEnabled(): boolean {
  return focusHumState.running;
}

function stopFocusHumNodesNow(): void {
  if (focusHumState.cleanupTimer !== null) {
    window.clearTimeout(focusHumState.cleanupTimer);
    focusHumState.cleanupTimer = null;
  }

  if (focusHumState.ctx && focusHumState.stateChangeHandler) {
    try {
      focusHumState.ctx.removeEventListener(
        'statechange',
        focusHumState.stateChangeHandler,
      );
    } catch {
      // ignore
    }
  }
  focusHumState.stateChangeHandler = null;
  focusHumState.ctx = null;

  for (const osc of focusHumState.oscNodes) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      // ignore
    }
  }
  focusHumState.oscNodes = [];

  if (focusHumState.lfoNode) {
    try {
      focusHumState.lfoNode.stop();
      focusHumState.lfoNode.disconnect();
    } catch {
      // ignore
    }
    focusHumState.lfoNode = null;
  }

  if (focusHumState.noiseNode) {
    try {
      focusHumState.noiseNode.stop();
      focusHumState.noiseNode.disconnect();
    } catch {
      // ignore
    }
    focusHumState.noiseNode = null;
  }

  for (const node of focusHumState.extraNodes) {
    try {
      node.disconnect();
    } catch {
      // ignore
    }
  }
  focusHumState.extraNodes = [];

  if (focusHumState.masterGain) {
    try {
      focusHumState.masterGain.disconnect();
    } catch {
      // ignore
    }
    focusHumState.masterGain = null;
  }
}

export async function setFocusHumEnabled(enabled: boolean): Promise<boolean> {
  if (enabled === focusHumState.running) {
    if (enabled && focusHumState.ctx && focusHumState.ctx.state === 'suspended') {
      try {
        await focusHumState.ctx.resume();
      } catch {
        scheduleAudioContextResumeOnGesture();
      }
    }
    return focusHumState.running;
  }

  if (!enabled) {
    focusHumState.running = false;
    notifyFocusHumListeners();

    const gain = focusHumState.masterGain;
    if (gain) {
      try {
        const ctx = gain.context;
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
        focusHumState.cleanupTimer = window.setTimeout(() => {
          stopFocusHumNodesNow();
        }, 720);
      } catch {
        stopFocusHumNodesNow();
      }
    } else {
      stopFocusHumNodesNow();
    }
    return false;
  }

  try {
    stopFocusHumNodesNow();
    unlockAudioPlayback();
    const ctx = await acquireUnlockedOutputAudioContext();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // Fallback to gesture auto-resume below
      }
    }
    if (ctx.state === 'suspended') {
      scheduleAudioContextResumeOnGesture(() => {
        if (focusHumState.running && focusHumState.masterGain) {
          const t = ctx.currentTime;
          focusHumState.masterGain.gain.cancelScheduledValues(t);
          focusHumState.masterGain.gain.setValueAtTime(0.001, t);
          focusHumState.masterGain.gain.linearRampToValueAtTime(0.24, t + 0.9);
        }
      });
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(0.24, now + 1.05);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(480, now);
    lowpass.Q.setValueAtTime(0.9, now);

    const warmthShelf = ctx.createBiquadFilter();
    warmthShelf.type = 'lowshelf';
    warmthShelf.frequency.setValueAtTime(140, now);
    warmthShelf.gain.setValueAtTime(3.2, now);

    lowpass.connect(warmthShelf);
    warmthShelf.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Slow breathing LFO modulating the sci-fi filter cutoff (350Hz - 610Hz)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.085, now);
    lfoGain.gain.setValueAtTime(130, now);
    lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);
    lfo.start(now);

    // Smooth, clearly audible warm sci-fi ambient wave (55Hz sub + 110Hz core + 164.81Hz fifth + 220Hz octave + 329.63Hz shimmer)
    const freqs: Array<{
      hz: number;
      type: OscillatorType;
      vol: number;
      detune: number;
      pan: number;
    }> = [
      { hz: 55, type: 'sine', vol: 0.28, detune: 0, pan: 0 },
      { hz: 110, type: 'sine', vol: 0.44, detune: -2.5, pan: -0.18 },
      { hz: 110, type: 'triangle', vol: 0.16, detune: 3.5, pan: 0.18 },
      { hz: 164.81, type: 'sine', vol: 0.24, detune: -4, pan: -0.26 },
      { hz: 220, type: 'sine', vol: 0.16, detune: 4, pan: 0.26 },
      { hz: 329.63, type: 'sine', vol: 0.06, detune: -3, pan: 0 },
    ];

    const oscs: OscillatorNode[] = [];
    const extraNodes: AudioNode[] = [lowpass, warmthShelf, lfoGain];

    for (const cfg of freqs) {
      const osc = ctx.createOscillator();
      const chGain = ctx.createGain();
      osc.type = cfg.type;
      osc.frequency.setValueAtTime(cfg.hz, now);
      osc.detune.setValueAtTime(cfg.detune, now);
      chGain.gain.setValueAtTime(cfg.vol, now);
      osc.connect(chGain);

      if (typeof ctx.createStereoPanner === 'function' && cfg.pan !== 0) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(cfg.pan, now);
        chGain.connect(panner);
        panner.connect(lowpass);
        extraNodes.push(panner, chGain);
      } else {
        chGain.connect(lowpass);
        extraNodes.push(chGain);
      }

      osc.start(now);
      oscs.push(osc);
    }

    // Soft filtered pink-ish sci-fi cabin air floor
    const noiseLen = Math.floor((ctx.sampleRate || 24000) * 2);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate || 24000);
    const data = noiseBuf.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < noiseLen; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.03 * white) / 1.03;
      lastOut = data[i];
      data[i] *= 0.42;
    }
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.16, now);
    noiseSrc.connect(noiseGain);
    noiseGain.connect(lowpass);
    noiseSrc.start(now);
    extraNodes.push(noiseGain);

    const onStateChange = () => {
      if (focusHumState.running && ctx.state === 'suspended') {
        void ctx.resume().catch(() => {
          scheduleAudioContextResumeOnGesture();
        });
      }
    };
    ctx.addEventListener('statechange', onStateChange);

    focusHumState.running = true;
    focusHumState.ctx = ctx;
    focusHumState.masterGain = masterGain;
    focusHumState.oscNodes = oscs;
    focusHumState.lfoNode = lfo;
    focusHumState.noiseNode = noiseSrc;
    focusHumState.extraNodes = extraNodes;
    focusHumState.stateChangeHandler = onStateChange;
    notifyFocusHumListeners();
    return true;
  } catch {
    focusHumState.running = false;
    notifyFocusHumListeners();
    return false;
  }
}

export async function playStandbyPromptChime(): Promise<void> {
  try {
    const ctx = await acquireUnlockedOutputAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const base = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.18, base);
    master.connect(ctx.destination);

    const steps = [
      { delay: 0.0, freq: 783.99, dur: 0.14 },
      { delay: 0.11, freq: 1174.66, dur: 0.24 },
    ];
    for (const s of steps) {
      const start = base + s.delay;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(s.freq, start);
      env.gain.setValueAtTime(0.001, start);
      env.gain.linearRampToValueAtTime(0.45, start + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, start + s.dur);
      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(start + s.dur + 0.02);
    }
  } catch {
    // Ignore audio context restrictions before gesture
  }
}

async function waitForSpeechVoices(
  timeoutMs = 320,
): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  const initial = window.speechSynthesis.getVoices();
  if (initial.length > 0) return initial;

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    window.setTimeout(done, timeoutMs);
  });
}

function selectJarvisSystemVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -1;

  for (const v of voices) {
    const name = v.name.toLowerCase();
    const lang = v.lang.toLowerCase();
    if (!lang.startsWith('en')) continue;

    let score = 0;
    if (lang === 'en-gb') score += 90;
    else if (lang === 'en-us') score += 75;
    else score += 50;

    if (
      name.includes('google uk english male') ||
      name.includes('daniel') ||
      name.includes('george') ||
      name.includes('ryan') ||
      name.includes('arthur') ||
      name.includes('oliver')
    ) {
      score += 80;
    } else if (
      name.includes('guy') ||
      name.includes('andrew') ||
      name.includes('brian') ||
      name.includes('david') ||
      name.includes('alex') ||
      name.includes('male')
    ) {
      score += 55;
    }

    if (name.includes('natural') || name.includes('online')) score += 35;
    if (name.includes('microsoft') || name.includes('google')) score += 20;
    if (v.localService) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }

  return best ?? selectBestVoice(voices, 'en-US');
}

const STANDBY_SYSTEM_PROMPTS = [
  'Confirm your identity.',
  'Enter your passcode.',
] as const;

let standbyPromptIndex = 0;

/**
 * Speaks a sleek J.A.R.V.I.S.-style system security prompt ("Confirm your identity." / "Enter your passcode.")
 * when entering Sleeping/Standby mode. Resolves `true` if audio playback started, `false` if blocked by autoplay.
 */
export async function speakStandbySystemPrompt(options?: {
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  const line =
    STANDBY_SYSTEM_PROMPTS[standbyPromptIndex % STANDBY_SYSTEM_PROMPTS.length];
  standbyPromptIndex += 1;

  try {
    const voices = await waitForSpeechVoices(320);
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(line);
    utterance.lang = 'en-GB';
    utterance.rate = 0.94;
    utterance.pitch = 0.85;
    utterance.volume = 0.92;

    const jarvisVoice = selectJarvisSystemVoice(voices);
    if (jarvisVoice) {
      utterance.voice = jarvisVoice;
      utterance.lang = jarvisVoice.lang || 'en-GB';
    }

    return await new Promise<boolean>((resolve) => {
      let started = false;
      let resolved = false;
      let startWatchdog: number | null = null;
      let endSafetyTimer: number | null = null;

      const finishEnd = () => {
        if (endSafetyTimer !== null) {
          window.clearTimeout(endSafetyTimer);
          endSafetyTimer = null;
        }
        options?.onEnd?.();
      };

      const resolveOnce = (ok: boolean) => {
        if (resolved) return;
        resolved = true;
        if (startWatchdog !== null) {
          window.clearTimeout(startWatchdog);
          startWatchdog = null;
        }
        resolve(ok);
      };

      utterance.onstart = () => {
        started = true;
        options?.onStart?.();
        endSafetyTimer = window.setTimeout(finishEnd, 3600);
        resolveOnce(true);
      };

      utterance.onend = () => {
        finishEnd();
        resolveOnce(started);
      };

      utterance.onerror = () => {
        if (!started) {
          resolveOnce(false);
        } else {
          finishEnd();
        }
      };

      startWatchdog = window.setTimeout(() => {
        if (!started) {
          try {
            window.speechSynthesis.cancel();
          } catch {
            // ignore
          }
          resolveOnce(false);
        }
      }, 650);

      window.speechSynthesis.speak(utterance);
    });
  } catch {
    return false;
  }
}

export async function playAccessDeniedAlertChime(): Promise<void> {
  try {
    const ctx = await acquireUnlockedOutputAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const base = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.22, base);
    master.connect(ctx.destination);

    // Dual-pulse Stark security denial alert (A4 -> Eb4 sharp warning)
    const steps = [
      { delay: 0.0, freq: 440.0, dur: 0.14 },
      { delay: 0.16, freq: 311.13, dur: 0.26 },
    ];
    for (const s of steps) {
      const start = base + s.delay;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const env = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(s.freq, start);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, start);
      env.gain.setValueAtTime(0.001, start);
      env.gain.linearRampToValueAtTime(0.45, start + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, start + s.dur);
      osc.connect(filter);
      filter.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(start + s.dur + 0.02);
    }
  } catch {
    // Ignore audio context restrictions
  }
}

const STANDBY_SECURITY_WARNINGS = [
  'Access denied. Please confirm your identity.',
  'Invalid passcode. Confirm your identity.',
] as const;

let standbyWarningIndex = 0;

/**
 * Speaks a crisp J.A.R.V.I.S.-style security warning when repeated wrong passcodes
 * or unrecognized phrases are spoken in Standby mode.
 */
export async function speakStandbySecurityWarning(options?: {
  onStart?: () => void;
  onEnd?: () => void;
}): Promise<boolean> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  const line =
    STANDBY_SECURITY_WARNINGS[
      standbyWarningIndex % STANDBY_SECURITY_WARNINGS.length
    ];
  standbyWarningIndex += 1;

  try {
    const voices = await waitForSpeechVoices(280);
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(line);
    utterance.lang = 'en-GB';
    utterance.rate = 0.94;
    utterance.pitch = 0.83;
    utterance.volume = 0.94;

    const jarvisVoice = selectJarvisSystemVoice(voices);
    if (jarvisVoice) {
      utterance.voice = jarvisVoice;
      utterance.lang = jarvisVoice.lang || 'en-GB';
    }

    return await new Promise<boolean>((resolve) => {
      let started = false;
      let resolved = false;
      let startWatchdog: number | null = null;
      let endSafetyTimer: number | null = null;

      const finishEnd = () => {
        if (endSafetyTimer !== null) {
          window.clearTimeout(endSafetyTimer);
          endSafetyTimer = null;
        }
        options?.onEnd?.();
      };

      const resolveOnce = (ok: boolean) => {
        if (resolved) return;
        resolved = true;
        if (startWatchdog !== null) {
          window.clearTimeout(startWatchdog);
          startWatchdog = null;
        }
        resolve(ok);
      };

      utterance.onstart = () => {
        started = true;
        options?.onStart?.();
        endSafetyTimer = window.setTimeout(finishEnd, 4200);
        resolveOnce(true);
      };

      utterance.onend = () => {
        finishEnd();
        resolveOnce(started);
      };

      utterance.onerror = () => {
        if (!started) {
          resolveOnce(false);
        } else {
          finishEnd();
        }
      };

      startWatchdog = window.setTimeout(() => {
        if (!started) {
          try {
            window.speechSynthesis.cancel();
          } catch {
            // ignore
          }
          resolveOnce(false);
        }
      }, 650);

      window.speechSynthesis.speak(utterance);
    });
  } catch {
    return false;
  }
}

export async function playTimerCompleteAlarm(): Promise<void> {
  try {
    const ctx = await acquireUnlockedOutputAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const base = ctx.currentTime + 0.02;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.24, base);
    master.connect(ctx.destination);

    // Dual-cycle futuristic Stark holographic alarm chime (C5 -> E5 -> G5 -> C6)
    const pattern = [
      { delay: 0.0, freq: 523.25, dur: 0.22 },
      { delay: 0.16, freq: 659.25, dur: 0.22 },
      { delay: 0.32, freq: 783.99, dur: 0.28 },
      { delay: 0.5, freq: 1046.5, dur: 0.52 },
      { delay: 1.05, freq: 523.25, dur: 0.22 },
      { delay: 1.21, freq: 659.25, dur: 0.22 },
      { delay: 1.37, freq: 783.99, dur: 0.28 },
      { delay: 1.55, freq: 1046.5, dur: 0.65 },
    ];

    for (const note of pattern) {
      const start = base + note.delay;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, start);
      env.gain.setValueAtTime(0.001, start);
      env.gain.exponentialRampToValueAtTime(0.45, start + 0.025);
      env.gain.exponentialRampToValueAtTime(0.001, start + note.dur);
      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(start + note.dur + 0.04);
    }
  } catch {
    // Ignore audio synthesis failures
  }
}

export async function playReminderAlertChime(): Promise<void> {
  try {
    const ctx = await acquireUnlockedOutputAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const base = ctx.currentTime + 0.02;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.2, base);
    master.connect(ctx.destination);

    const tones = [
      { delay: 0.0, freq: 587.33, dur: 0.24 },
      { delay: 0.14, freq: 880.0, dur: 0.36 },
      { delay: 0.32, freq: 1174.66, dur: 0.48 },
    ];

    for (const tone of tones) {
      const start = base + tone.delay;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.freq, start);
      env.gain.setValueAtTime(0.001, start);
      env.gain.exponentialRampToValueAtTime(0.42, start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, start + tone.dur);
      osc.connect(env);
      env.connect(master);
      osc.start(start);
      osc.stop(start + tone.dur + 0.03);
    }
  } catch {
    // Ignore audio synthesis failures
  }
}

export function speakFallbackUtterance(
  text: string,
  language: LanguageCode,
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  const clean = text.trim();
  if (!clean) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = language === 'en-US' ? 'en-US' : 'bn-BD';
    utterance.rate = 1.0;
    utterance.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const preferred = selectBestVoice(voices, language);
    if (preferred) {
      utterance.voice = preferred;
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore SpeechSynthesis errors
  }
}

export async function speakFarewellFallback(
  text: string,
  language: LanguageCode,
): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  const clean = text.trim();
  if (!clean) return;

  try {
    const voices = await waitForSpeechVoices(260);
    window.speechSynthesis.cancel();
    const hasBengaliChars = /[\u0980-\u09FF]/.test(clean);
    const targetLang: LanguageCode = hasBengaliChars ? language : 'en-US';

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = targetLang === 'en-US' ? 'en-US' : 'bn-BD';
    utterance.rate = 0.98;
    utterance.pitch = 1.05;

    const preferred = selectBestVoice(voices, targetLang);
    if (preferred) {
      utterance.voice = preferred;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(safetyTimer);
        resolve();
      };
      const safetyTimer = window.setTimeout(done, 5200);
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    });
  } catch {
    // Ignore SpeechSynthesis errors
  }
}
