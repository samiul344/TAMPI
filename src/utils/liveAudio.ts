import {
  ChatTurn,
  LanguageCode,
  LipSyncWeights,
  LiveVoiceName,
  MemoryItem,
  StructuredAction,
  StudyTask,
} from '../types/tampi';
import { acquireUnlockedOutputAudioContext } from './wakeWord';

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
  onSpeakingChange: (speaking: boolean) => void;
  onAction: (action: StructuredAction) => void;
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
  private muted = false;
  private isDisconnected = false;
  private handlers: LiveSessionHandlers;

  constructor(handlers: LiveSessionHandlers) {
    this.handlers = handlers;
  }

  public async connect(config: {
    userName?: string;
    persona: string;
    memories: MemoryItem[];
    tasks: StudyTask[];
    localDateTime: string;
    language: LanguageCode;
    voiceName: LiveVoiceName;
    history: ChatTurn[];
    wakeTrigger?: string;
  }): Promise<void> {
    this.disconnect();
    this.isDisconnected = false;

    // 1. Acquire & Resume Unlocked Playback AudioContext Immediately on Wake-Up
    this.outputCtx = await acquireUnlockedOutputAudioContext();
    await this.outputCtx.resume();
    this.analyser = this.outputCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.55;
    this.analyser.connect(this.outputCtx.destination);
    this.freqData = new Uint8Array(
      new ArrayBuffer(this.analyser.frequencyBinCount),
    );

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    if (this.isDisconnected) return;

    this.inputCtx = new AudioContext({ sampleRate: 16000 });
    await this.inputCtx.resume();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/live`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      if (this.isDisconnected) return;
      this.ws?.send(
        JSON.stringify({
          type: 'init',
          userName: config.userName,
          persona: config.persona,
          memories: config.memories.map((m) => ({
            category: m.category,
            content: m.content,
          })),
          tasks: config.tasks.map((t) => ({
            title: t.title,
            subject: t.subject,
            dueLabel: t.dueLabel,
            completed: t.completed,
          })),
          localDateTime: config.localDateTime,
          language: config.language,
          voiceName: config.voiceName,
          history: config.history.map((h) => ({
            role: h.role,
            text: h.text,
          })),
        }),
      );
    };

    this.ws.onmessage = async (event) => {
      if (this.isDisconnected) return;
      const msg = JSON.parse(event.data) as {
        type: string;
        audio?: string;
        text?: string;
        action?: StructuredAction;
        error?: string;
      };

      if (msg.type === 'ready') {
        if (this.outputCtx && this.outputCtx.state === 'suspended') {
          try {
            await this.outputCtx.resume();
          } catch {
            // ignore resume errors
          }
        }

        if (config.wakeTrigger) {
          // Wait 200ms after Gemini Live onopen ('ready') for audio output readiness, then trigger Tampi to speak FIRST
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (
            this.isDisconnected ||
            !this.ws ||
            this.ws.readyState !== WebSocket.OPEN
          ) {
            return;
          }
          this.ws.send(
            JSON.stringify({
              type: 'text',
              text: config.wakeTrigger,
              turnComplete: true,
            }),
          );
        }

        this.startMicCapture();
        this.handlers.onReady();
      } else if (msg.type === 'audio' && msg.audio) {
        this.enqueuePlayback(msg.audio);
      } else if (msg.type === 'inputTranscript' && msg.text) {
        if (this.activeSources.size > 0) {
          this.flushPlayback();
        }
        this.handlers.onInputTranscript(msg.text);
      } else if (msg.type === 'outputTranscript' && msg.text) {
        this.handlers.onOutputTranscript(msg.text);
      } else if (msg.type === 'interrupted') {
        this.flushPlayback();
      } else if (msg.type === 'action' && msg.action) {
        this.handlers.onAction(msg.action);
      } else if (msg.type === 'error' && msg.error) {
        this.handlers.onError(msg.error);
      } else if (msg.type === 'closed') {
        this.handlers.onClosed();
      }
    };

    this.ws.onerror = () => {
      if (this.isDisconnected) return;
      this.handlers.onError('WebSocket connection to Live voice service failed.');
    };

    this.ws.onclose = () => {
      if (this.isDisconnected) return;
      this.handlers.onClosed();
    };
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
    if (!this.outputCtx || !this.analyser) return;
    if (this.outputCtx.state === 'suspended') {
      void this.outputCtx.resume();
    }

    const samples = base64ToInt16Float32(base64Pcm);
    const buffer = this.outputCtx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = this.outputCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);

    const now = this.outputCtx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.015;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;
    this.activeSources.add(source);
    this.handlers.onSpeakingChange(true);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0) {
        this.handlers.onSpeakingChange(false);
      }
    };
  }

  public flushPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    if (this.outputCtx) {
      this.nextStartTime = this.outputCtx.currentTime;
    }
    this.handlers.onSpeakingChange(false);
  }

  public sendText(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && text.trim()) {
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
    this.flushPlayback();

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
