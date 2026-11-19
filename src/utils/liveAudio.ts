import {
  ChatTurn,
  LanguageCode,
  LipSyncWeights,
  LiveVoiceName,
  MemoryItem,
  SearchSource,
  SmartNote,
  StructuredAction,
  StudyTask,
} from '../types/tampi';
import {
  acquireUnlockedOutputAudioContext,
  playPreSpeechHudSfx,
} from './wakeWord';

function downsampleBuffer(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    result[i] = count > 0 ? sum / count : input[Math.min(start, input.length - 1)];
  }
  return result;
}

function float32ToInt16Base64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToInt16Float32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

const ZERO_LIP_SYNC: LipSyncWeights = {
  amplitude: 0,
  aa: 0,
  ih: 0,
  ou: 0,
  ee: 0,
  oh: 0,
};

export interface LiveSessionHandlers {
  onReady: () => void;
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onBeforeResponseAudio?: (isNewResponse: boolean) => boolean;
  onSpeakingChange: (speaking: boolean) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onAction: (action: StructuredAction) => void;
  onSearching?: (query: string) => void;
  onSearchResults?: (query: string, sources: SearchSource[]) => void;
  onError: (message: string) => void;
  onClosed: () => void;
}

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private micStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private zeroGainNode: GainNode | null = null;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private nextStartTime = 0;
  private playbackGeneration = 0;
  private isSpeaking = false;
  private awaitingNewResponse = true;
  private speechAborted = false;
  private muted = false;
  private isDisconnected = false;
  private handlers: LiveSessionHandlers;

  constructor(handlers: LiveSessionHandlers) {
    this.handlers = handlers;
  }

  public async connect(config: {
    userName?: string;
    persona: string;
    memories?: MemoryItem[];
    notes?: SmartNote[];
    tasks?: StudyTask[];
    localDateTime: string;
    localIsoWithOffset?: string;
    language: LanguageCode;
    voiceName: LiveVoiceName;
    history?: ChatTurn[];
    wakeTrigger?: string;
    micAcquireDelayMs?: number;
  }): Promise<void> {
    this.disconnect();
    this.isDisconnected = false;
    this.speechAborted = false;
    this.awaitingNewResponse = true;
    this.muted = false;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/live`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    // Prepare output AudioContext and mic capture in parallel while WebSocket + Gemini Live connect
    const outputReadyPromise = (async () => {
      const ctx = await acquireUnlockedOutputAudioContext();
      if (this.isDisconnected) return;
      this.outputCtx = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (this.isDisconnected) return;
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.55;
      this.analyser.connect(ctx.destination);
      this.freqData = new Uint8Array(
        new ArrayBuffer(this.analyser.frequencyBinCount),
      );
      this.nextStartTime = ctx.currentTime;
    })();

    const micReadyPromise = (async () => {
      if (config.micAcquireDelayMs && config.micAcquireDelayMs > 0) {
        await new Promise((r) => window.setTimeout(r, config.micAcquireDelayMs));
      }
      if (this.isDisconnected) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (this.isDisconnected) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.micStream = stream;
      this.inputCtx = new AudioContext({ sampleRate: 16000 });
      await this.inputCtx.resume();
    })();

    ws.onopen = () => {
      if (this.isDisconnected) return;
      ws.send(
        JSON.stringify({
          type: 'init',
          userName: config.userName,
          persona: config.persona,
          memories: (config.memories ?? []).map((m) => ({
            category: m.category,
            content: m.content,
          })),
          notes: (config.notes ?? []).map((n) => ({
            kind: n.kind,
            content: n.content,
            remindAt: n.remindAt,
            dueLabel: n.dueLabel,
            completed: n.completed,
          })),
          tasks: (config.tasks ?? []).map((t) => ({
            title: t.title,
            subject: t.subject,
            dueLabel: t.dueLabel,
            completed: t.completed,
          })),
          localDateTime: config.localDateTime,
          localIsoWithOffset:
            config.localIsoWithOffset ?? new Date().toISOString(),
          language: config.language,
          voiceName: config.voiceName,
          history: (config.history ?? []).map((h) => ({
            role: h.role,
            text: h.text,
          })),
          wakeTrigger: config.wakeTrigger,
        }),
      );
    };

    ws.onmessage = async (event) => {
      if (this.isDisconnected) return;
      const msg = JSON.parse(event.data) as {
        type: string;
        audio?: string;
        text?: string;
        query?: string;
        sources?: SearchSource[];
        action?: StructuredAction;
        error?: string;
      };

      if (msg.type === 'ready') {
        await outputReadyPromise.catch(() => {});
        if (this.isDisconnected || this.speechAborted) return;
        if (this.outputCtx && this.outputCtx.state === 'suspended') {
          try {
            await this.outputCtx.resume();
          } catch {
            // ignore resume errors
          }
        }
        if (config.wakeTrigger) {
          playPreSpeechHudSfx();
        }
        await micReadyPromise.catch(() => {});
        if (this.isDisconnected || this.speechAborted) return;
        this.startMicCapture();
        this.handlers.onReady();
      } else if (msg.type === 'audio' && msg.audio) {
        if (this.speechAborted) return;
        const genBeforeAwait = this.playbackGeneration;
        await outputReadyPromise.catch(() => {});
        if (
          this.isDisconnected ||
          this.speechAborted ||
          genBeforeAwait !== this.playbackGeneration
        ) {
          return;
        }
        const isNewResponse = this.awaitingNewResponse;
        if (this.handlers.onBeforeResponseAudio?.(isNewResponse) === false) {
          return;
        }
        // Clear any lingering previous-turn audio queue as soon as a new response begins
        if (isNewResponse) {
          this.awaitingNewResponse = false;
          if (this.activeSources.size > 0) {
            this.stopAndClearAudioQueue();
          }
        }
        this.enqueuePlayback(msg.audio);
      } else if (msg.type === 'inputTranscript' && msg.text) {
        if (!this.speechAborted) {
          this.handlers.onInputTranscript(msg.text);
        }
      } else if (msg.type === 'outputTranscript' && msg.text) {
        if (!this.speechAborted) {
          this.handlers.onOutputTranscript(msg.text);
        }
      } else if (msg.type === 'interrupted') {
        this.awaitingNewResponse = true;
        this.stopAndClearAudioQueue();
        this.handlers.onInterrupted?.();
      } else if (msg.type === 'turnComplete') {
        this.awaitingNewResponse = true;
        this.handlers.onTurnComplete?.();
      } else if (msg.type === 'searching' && msg.query) {
        if (!this.speechAborted) {
          this.handlers.onSearching?.(msg.query);
        }
      } else if (msg.type === 'searchResults') {
        if (!this.speechAborted) {
          this.handlers.onSearchResults?.(
            msg.query ?? '',
            Array.isArray(msg.sources) ? msg.sources : [],
          );
        }
      } else if (msg.type === 'action' && msg.action) {
        if (!this.speechAborted) {
          this.handlers.onAction(msg.action);
        }
      } else if (msg.type === 'error' && msg.error) {
        if (!this.speechAborted) {
          this.handlers.onError(msg.error);
        }
      } else if (msg.type === 'closed') {
        if (!this.speechAborted) {
          this.handlers.onClosed();
        }
      }
    };

    ws.onerror = () => {
      if (this.isDisconnected || this.speechAborted) return;
      this.handlers.onError('WebSocket connection to Live voice service failed.');
    };

    ws.onclose = () => {
      if (this.isDisconnected || this.speechAborted) return;
      this.handlers.onClosed();
    };

    await Promise.all([outputReadyPromise, micReadyPromise]);
  }

  private startMicCapture(): void {
    if (!this.inputCtx || !this.micStream || !this.ws) return;

    this.sourceNode = this.inputCtx.createMediaStreamSource(this.micStream);
    this.processor = this.inputCtx.createScriptProcessor(2048, 1, 1);
    this.zeroGainNode = this.inputCtx.createGain();
    this.zeroGainNode.gain.value = 0;

    this.sourceNode.connect(this.processor);
    this.processor.connect(this.zeroGainNode);
    this.zeroGainNode.connect(this.inputCtx.destination);

    const nativeRate = this.inputCtx.sampleRate;

    this.processor.onaudioprocess = (event) => {
      if (
        this.muted ||
        this.speechAborted ||
        this.isDisconnected ||
        !this.ws ||
        this.ws.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      const rawChannel = event.inputBuffer.getChannelData(0);
      const resampled = downsampleBuffer(rawChannel, nativeRate, 16000);
      const base64 = float32ToInt16Base64(resampled);
      this.ws.send(JSON.stringify({ type: 'audio', audio: base64 }));
    };
  }

  private enqueuePlayback(base64Pcm: string): void {
    if (!this.outputCtx || !this.analyser || this.speechAborted) return;
    if (this.outputCtx.state === 'suspended') {
      void this.outputCtx.resume();
    }

    const samples = base64ToInt16Float32(base64Pcm);
    if (samples.length === 0) return;

    const buffer = this.outputCtx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = this.outputCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);

    const now = this.outputCtx.currentTime;
    // Use a 45ms jitter cushion when starting from silence or recovering from underrun;
    // consecutive chunks in the same response stitch sample-accurately with zero gap or overlap.
    if (this.activeSources.size === 0 || this.nextStartTime < now + 0.005) {
      this.nextStartTime = now + 0.045;
    }

    const scheduledStart = this.nextStartTime;
    const generation = this.playbackGeneration;
    source.start(scheduledStart);
    this.nextStartTime = scheduledStart + buffer.duration;
    this.activeSources.add(source);

    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.handlers.onSpeakingChange(true);
    }

    source.onended = () => {
      if (generation !== this.playbackGeneration) return;
      this.activeSources.delete(source);
      try {
        source.disconnect();
      } catch {
        // ignore
      }
      if (this.activeSources.size === 0 && this.isSpeaking) {
        this.isSpeaking = false;
        this.handlers.onSpeakingChange(false);
      }
    };
  }

  /**
   * Immediately stops all scheduled/playing Web Audio buffer sources and clears the queue
   * so newly arriving audio never overlaps with prior speech.
   */
  public stopAndClearAudioQueue(): void {
    this.playbackGeneration += 1;
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    } else {
      this.nextStartTime = 0;
    }
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.handlers.onSpeakingChange(false);
    }
  }

  /**
   * Alias for stopAndClearAudioQueue for callers stopping current playback.
   */
  public flushPlayback(): void {
    this.stopAndClearAudioQueue();
  }

  /**
   * Hard-aborts all ongoing Live audio, mutes the mic, cancels any browser TTS,
   * and signals the server to terminate the Gemini Live turn immediately (used on Shutdown).
   */
  public abortCurrentSpeech(): void {
    this.speechAborted = true;
    this.muted = true;
    this.awaitingNewResponse = true;
    this.stopAndClearAudioQueue();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'abort_shutdown' }));
      } catch {
        // ignore
      }
    }
  }

  public sendText(text: string): void {
    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      text.trim() &&
      !this.speechAborted
    ) {
      this.stopAndClearAudioQueue();
      this.awaitingNewResponse = true;
      this.ws.send(JSON.stringify({ type: 'text', text: text.trim() }));
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public getLipSyncWeights(): LipSyncWeights {
    if (!this.analyser || !this.freqData || this.activeSources.size === 0) {
      return ZERO_LIP_SYNC;
    }

    this.analyser.getByteFrequencyData(this.freqData);

    let lowSum = 0;
    for (let i = 2; i <= 10 && i < this.freqData.length; i++) {
      lowSum += this.freqData[i];
    }
    let midSum = 0;
    for (let i = 11; i <= 28 && i < this.freqData.length; i++) {
      midSum += this.freqData[i];
    }
    let roundSum = 0;
    for (let i = 1; i <= 5 && i < this.freqData.length; i++) {
      roundSum += this.freqData[i];
    }

    const lowNorm = Math.min(1, lowSum / (9 * 130));
    const midNorm = Math.min(1, midSum / (18 * 95));
    const roundNorm = Math.min(1, roundSum / (5 * 140));
    const amplitude = Math.min(1, lowNorm * 0.65 + midNorm * 0.35);

    if (amplitude < 0.03) {
      return ZERO_LIP_SYNC;
    }

    const nowSec = performance.now() * 0.001;
    const phaseA = 0.5 + 0.5 * Math.sin(nowSec * 11.5);
    const phaseB = 0.5 + 0.5 * Math.cos(nowSec * 8.3);

    return {
      amplitude,
      aa: Math.min(0.95, lowNorm * (0.55 + 0.45 * phaseA)),
      oh: Math.min(0.8, roundNorm * 0.65 * phaseB),
      ou: Math.min(0.7, roundNorm * 0.52 * (1 - phaseA * 0.5)),
      ih: Math.min(0.75, midNorm * 0.72 * (1 - phaseB * 0.4)),
      ee: Math.min(0.75, midNorm * 0.68 * phaseA),
    };
  }

  public copyFrequencyBins(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.analyser || !this.freqData || this.activeSources.size === 0) {
      target.fill(0);
      return false;
    }
    this.analyser.getByteFrequencyData(this.freqData);
    const len = Math.min(target.length, this.freqData.length);
    for (let i = 0; i < len; i++) {
      target[i] = this.freqData[i];
    }
    return true;
  }

  public disconnect(): void {
    this.isDisconnected = true;
    this.speechAborted = true;
    this.awaitingNewResponse = true;
    this.stopAndClearAudioQueue();

    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    if (this.zeroGainNode) {
      this.zeroGainNode.disconnect();
      this.zeroGainNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.inputCtx) {
      void this.inputCtx.close();
      this.inputCtx = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    this.outputCtx = null;
    this.freqData = null;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
