import React, { useEffect, useRef } from 'react';
import { AudioLines, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { AssistantState, AvatarEmotion, StudyTimerState } from '../types/tampi';

interface StarkHudProps {
  assistantState: AssistantState;
  emotion: AvatarEmotion;
  liveConnected: boolean;
  standbyListening: boolean;
  bootSequenceActive: boolean;
  wakePulseKey: number;
  miniWidget?: boolean;
  focusMode?: boolean;
  focusAudioActive?: boolean;
  securityAlertActive?: boolean;
  timer?: StudyTimerState;
  onTogglePauseTimer?: () => void;
  onAddFiveMinutes?: () => void;
  onStopTimer?: () => void;
  onToggleFocusAudio?: () => void;
  getAudioSpectrum: (bins: Uint8Array<ArrayBuffer>) => boolean;
}

function formatTimerClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const StarkHud: React.FC<StarkHudProps> = ({
  assistantState,
  emotion,
  liveConnected,
  standbyListening,
  bootSequenceActive,
  wakePulseKey,
  miniWidget = false,
  focusMode = false,
  focusAudioActive = false,
  securityAlertActive = false,
  timer,
  onTogglePauseTimer,
  onAddFiveMinutes,
  onStopTimer,
  onToggleFocusAudio,
  getAudioSpectrum,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<AssistantState>(assistantState);
  const emotionRef = useRef<AvatarEmotion>(emotion);
  const liveConnectedRef = useRef<boolean>(liveConnected);
  const bootRef = useRef<boolean>(bootSequenceActive);
  const focusModeRef = useRef<boolean>(focusMode);
  const securityAlertRef = useRef<boolean>(securityAlertActive);
  const getSpectrumRef = useRef(getAudioSpectrum);

  useEffect(() => {
    stateRef.current = assistantState;
  }, [assistantState]);

  useEffect(() => {
    emotionRef.current = emotion;
  }, [emotion]);

  useEffect(() => {
    liveConnectedRef.current = liveConnected;
  }, [liveConnected]);

  useEffect(() => {
    bootRef.current = bootSequenceActive;
  }, [bootSequenceActive]);

  useEffect(() => {
    focusModeRef.current = focusMode;
  }, [focusMode]);

  useEffect(() => {
    securityAlertRef.current = securityAlertActive;
  }, [securityAlertActive]);

  useEffect(() => {
    getSpectrumRef.current = getAudioSpectrum;
  }, [getAudioSpectrum]);

  const isActive =
    bootSequenceActive || liveConnected || assistantState !== 'idle';
  const isWarmMood =
    emotion === 'sulking' || emotion === 'angry' || emotion === 'sad';
  const isFocus = focusMode && !isWarmMood;

  const bracketColorClass = securityAlertActive
    ? 'border-rose-500/90 shadow-[0_0_22px_rgba(244,63,94,0.6),0_0_12px_rgba(245,158,11,0.4)] animate-pulse'
    : isWarmMood
      ? 'border-rose-400/55 shadow-[0_0_12px_rgba(244,63,94,0.28)]'
      : isFocus
        ? 'border-indigo-400/65 shadow-[0_0_16px_rgba(99,102,241,0.34)]'
        : isActive
          ? 'border-cyan-400/65 shadow-[0_0_14px_rgba(34,211,238,0.3)]'
          : 'border-sky-500/35 shadow-[0_0_10px_rgba(14,165,233,0.16)]';

  const cornerAccentClass = securityAlertActive
    ? 'bg-amber-400'
    : isWarmMood
      ? 'bg-amber-400/75'
      : isFocus
        ? 'bg-indigo-300/85'
        : isActive
          ? 'bg-amber-400/80'
          : 'bg-sky-400/40';

  const telemetryStatusLabel = securityAlertActive
    ? 'ACCESS DENIED'
    : bootSequenceActive
      ? 'BOOTING'
      : isFocus
        ? 'FOCUS MODE'
        : isActive
          ? 'ACTIVE'
          : 'STANDBY';

  const telemetryToneClass = securityAlertActive
    ? 'text-rose-400 animate-pulse'
    : isWarmMood
      ? 'text-rose-300/90'
      : isFocus
        ? 'text-indigo-300/95'
        : isActive
          ? 'text-cyan-300/95'
          : standbyListening
            ? 'text-sky-300/75'
            : 'text-slate-400/75';

  // Ambient viewport edge glow (Security Alert -> Standby sky -> Active cyan/gold -> Focus deep indigo -> Sad/Sulky warm rose/amber)
  const ambientGlowStyle = securityAlertActive
    ? 'radial-gradient(circle at 50% 44%, rgba(244, 63, 94, 0.25) 0%, rgba(245, 158, 11, 0.14) 40%, rgba(127, 29, 29, 0.18) 76%)'
    : isWarmMood
      ? 'radial-gradient(circle at 50% 44%, rgba(244, 63, 94, 0.16) 0%, rgba(245, 158, 11, 0.09) 38%, transparent 72%)'
      : isFocus
        ? 'radial-gradient(circle at 50% 44%, rgba(99, 102, 241, 0.19) 0%, rgba(49, 46, 129, 0.14) 44%, rgba(15, 23, 42, 0.28) 76%)'
        : isActive
          ? 'radial-gradient(circle at 50% 44%, rgba(34, 211, 238, 0.15) 0%, rgba(245, 158, 11, 0.06) 42%, transparent 72%)'
          : 'radial-gradient(circle at 50% 44%, rgba(14, 165, 233, 0.10) 0%, rgba(30, 58, 138, 0.07) 42%, transparent 72%)';

  // Circular Audio Spectrum Visualizer Canvas Loop
  useEffect(() => {
    if (miniWidget) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bins = new Uint8Array(new ArrayBuffer(128));
    const barCount = 48;
    const smoothedBars = new Float32Array(barCount);
    let animId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(80, Math.round(rect.width * dpr));
      const targetH = Math.max(80, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    };

    syncCanvasSize();
    window.addEventListener('resize', syncCanvasSize);

    const render = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const t = now * 0.001;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      const baseRadius = minDim * 0.30;
      const maxBarLen = minDim * 0.16;

      ctx.clearRect(0, 0, w, h);

      const mode = stateRef.current;
      const emo = emotionRef.current;
      const connected = liveConnectedRef.current;
      const booting = bootRef.current;
      const focus = focusModeRef.current;
      const alertMode = securityAlertRef.current;
      const activeMode = booting || connected || mode !== 'idle';
      const warmMode = alertMode || emo === 'sulking' || emo === 'angry' || emo === 'sad';
      const focusVisual = focus && !warmMode;

      const hasAudio = getSpectrumRef.current(bins);
      const isSpeaking = mode === 'speaking' && hasAudio;

      const primaryRgb = alertMode
        ? '244, 63, 94'
        : warmMode
          ? '251, 113, 133'
          : focusVisual
            ? '129, 140, 248'
            : activeMode
              ? '34, 211, 238'
              : '56, 189, 248';
      const accentRgb = warmMode
        ? '245, 158, 11'
        : focusVisual
          ? '99, 102, 241'
          : '245, 158, 11';

      // Outer subtle segmented ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * (booting ? 2.6 : focusVisual ? 0.18 : activeMode ? 0.35 : 0.12));
      ctx.lineWidth = Math.max(1, minDim * 0.011);

      for (let s = 0; s < 3; s++) {
        const startAngle = (s * Math.PI * 2) / 3 + 0.14;
        const endAngle = startAngle + (Math.PI * 2) / 3 - 0.34;
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius + maxBarLen + minDim * 0.032, startAngle, endAngle);
        ctx.strokeStyle =
          s === 0 && (activeMode || focusVisual)
            ? `rgba(${accentRgb}, 0.52)`
            : `rgba(${primaryRgb}, ${activeMode || focusVisual ? 0.44 : 0.22})`;
        ctx.stroke();
      }
      ctx.restore();

      // Inner crisp base circle
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius - minDim * 0.015, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, minDim * 0.01);
      ctx.strokeStyle = `rgba(${primaryRgb}, ${activeMode || focusVisual ? 0.55 : 0.28})`;
      ctx.stroke();

      // Radial audio spectrum bars
      let energySum = 0;
      for (let i = 0; i < barCount; i++) {
        let targetVal = 0.06;
        if (isSpeaking) {
          const mirrorIdx = i < barCount / 2 ? i : barCount - 1 - i;
          const binIndex = Math.min(54, 1 + Math.floor(mirrorIdx * 1.9));
          const raw = bins[binIndex] / 255;
          targetVal = Math.min(1, Math.pow(raw, 0.85) * 1.18 + 0.06);
        } else if (booting) {
          targetVal = 0.28 + 0.38 * (0.5 + 0.5 * Math.sin(t * 14 - i * 0.35));
        } else if (mode === 'listening') {
          targetVal = 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(t * 4.2 + i * 0.26));
        } else if (mode === 'thinking') {
          targetVal = 0.14 + 0.22 * (0.5 + 0.5 * Math.sin(t * 6.5 - i * 0.4));
        } else {
          targetVal = 0.06 + 0.07 * (0.5 + 0.5 * Math.sin(t * 2.0 + i * 0.25));
        }

        const lerpFactor = 1 - Math.exp(-(isSpeaking ? 20 : 10) * dt);
        smoothedBars[i] += (targetVal - smoothedBars[i]) * lerpFactor;
        const val = smoothedBars[i];
        energySum += val;

        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const r0 = baseRadius;
        const r1 = baseRadius + val * maxBarLen;

        const x0 = cx + Math.cos(angle) * r0;
        const y0 = cy + Math.sin(angle) * r0;
        const x1 = cx + Math.cos(angle) * r1;
        const y1 = cy + Math.sin(angle) * r1;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.lineWidth = Math.max(1.5, minDim * 0.017);
        ctx.lineCap = 'round';
        if (val > 0.62 && (activeMode || focusVisual)) {
          ctx.strokeStyle = `rgba(${accentRgb}, ${0.75 + val * 0.25})`;
        } else {
          ctx.strokeStyle = `rgba(${primaryRgb}, ${activeMode || focusVisual ? 0.48 + val * 0.5 : 0.28 + val * 0.35})`;
        }
        ctx.stroke();
      }

      // Soft center radial pulse
      const avgEnergy = energySum / barCount;
      const innerGlow = ctx.createRadialGradient(
        cx,
        cy,
        2,
        cx,
        cy,
        baseRadius * 0.9,
      );
      innerGlow.addColorStop(
        0,
        `rgba(${primaryRgb}, ${activeMode || focusVisual ? 0.16 + avgEnergy * 0.22 : 0.06})`,
      );
      innerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = innerGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * 0.9, 0, Math.PI * 2);
      ctx.fill();

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', syncCanvasSize);
    };
  }, [miniWidget]);

  // Holographic Countdown Ring geometry
  const ringRadius = 64;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const timerProgress =
    timer && timer.totalSeconds > 0
      ? Math.max(0, Math.min(1, timer.remainingSeconds / timer.totalSeconds))
      : 0;
  const ringDashOffset = ringCircumference * (1 - timerProgress);

  return (
    <>
      {/* Ambient State & Mood Radial Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] transition-all duration-700"
        style={{ background: ambientGlowStyle }}
      />

      {/* 1.5s Holographic Vertical Scanline Sweep on Wake-Up Boot */}
      {bootSequenceActive && wakePulseKey > 0 && (
        <div
          key={wakePulseKey}
          aria-hidden="true"
          className="hud-scan-sweep pointer-events-none fixed inset-x-0 top-0 z-[12] h-28"
        >
          <div className="h-full w-full bg-gradient-to-b from-transparent via-cyan-400/18 to-cyan-300/35" />
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_24px_rgba(34,211,238,0.95),0_0_10px_rgba(245,158,11,0.5)]" />
        </div>
      )}

      {/* Minimal 1px Corner HUD Targeting Brackets (┌ ┐ └ ┘) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-2.5 sm:inset-4 z-10"
      >
        {/* Top-Left ┌ */}
        <div
          className={`absolute top-0 left-0 h-5 w-5 sm:h-7 sm:w-7 border-t border-l transition-colors duration-500 ${bracketColorClass}`}
        >
          <span
            className={`absolute top-1.5 left-1.5 h-1 w-1 transition-colors duration-500 ${cornerAccentClass}`}
          />
        </div>

        {/* Top-Right ┐ */}
        <div
          className={`absolute top-0 right-0 h-5 w-5 sm:h-7 sm:w-7 border-t border-r transition-colors duration-500 ${bracketColorClass}`}
        >
          <span
            className={`absolute top-1.5 right-1.5 h-1 w-1 transition-colors duration-500 ${cornerAccentClass}`}
          />
        </div>

        {/* Bottom-Left └ */}
        <div
          className={`absolute bottom-0 left-0 h-5 w-5 sm:h-7 sm:w-7 border-b border-l transition-colors duration-500 ${bracketColorClass}`}
        >
          <span
            className={`absolute bottom-1.5 left-1.5 h-1 w-1 transition-colors duration-500 ${cornerAccentClass}`}
          />
        </div>

        {/* Bottom-Right ┘ */}
        <div
          className={`absolute bottom-0 right-0 h-5 w-5 sm:h-7 sm:w-7 border-b border-r transition-colors duration-500 ${bracketColorClass}`}
        >
          <span
            className={`absolute bottom-1.5 right-1.5 h-1 w-1 transition-colors duration-500 ${cornerAccentClass}`}
          />
        </div>
      </div>

      {/* Subtle Micro-Telemetry, Holographic Countdown Ring & Right-Side Circular Audio Spectrum */}
      {!miniWidget && (
        <>
          <div className="pointer-events-none fixed left-6 top-14 sm:left-8 sm:top-[60px] z-10 flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] tabular-nums">
            <span className="text-slate-500">NEURAL LINK:</span>
            <span className={`font-semibold transition-colors duration-500 ${telemetryToneClass}`}>
              {telemetryStatusLabel}
            </span>
            {isWarmMood && (
              <>
                <span className="text-slate-600" aria-hidden="true">
                  /
                </span>
                <span className="text-amber-300/90">
                  {emotion === 'sad' ? 'EMPATHY' : 'OVIMAN'}
                </span>
              </>
            )}
          </div>

          {/* Rotating Holographic Focus Countdown Ring (Visible when Study Timer active) */}
          {timer?.active && (
            <section
              aria-label="Holographic Focus Countdown Ring"
              className="pointer-events-auto fixed left-3 top-24 sm:left-7 sm:top-1/2 sm:-translate-y-1/2 z-10 flex flex-col items-center gap-2.5 rounded-2xl backdrop-blur-xl bg-[#07091b]/72 border border-indigo-400/35 px-4 py-4 shadow-[0_0_36px_rgba(99,102,241,0.24)]"
            >
              <div className="relative h-36 w-36 sm:h-40 sm:w-40 flex items-center justify-center">
                {/* Outer rotating dashed holographic bezel */}
                <svg
                  viewBox="0 0 160 160"
                  className="absolute inset-0 h-full w-full animate-[spin_28s_linear_infinite]"
                  aria-hidden="true"
                >
                  <circle
                    cx="80"
                    cy="80"
                    r="74"
                    fill="none"
                    stroke="rgba(129, 140, 248, 0.36)"
                    strokeWidth="1.5"
                    strokeDasharray="10 7 3 7"
                  />
                </svg>

                {/* Inner counter-rotating reticle */}
                <svg
                  viewBox="0 0 160 160"
                  className="absolute inset-0 h-full w-full animate-[spin_18s_linear_infinite_reverse]"
                  aria-hidden="true"
                >
                  <circle
                    cx="80"
                    cy="80"
                    r="54"
                    fill="none"
                    stroke="rgba(165, 180, 252, 0.25)"
                    strokeWidth="1"
                    strokeDasharray="4 6"
                  />
                </svg>

                {/* Smooth countdown progress arc */}
                <svg
                  viewBox="0 0 160 160"
                  className="absolute inset-0 h-full w-full -rotate-90"
                  aria-hidden="true"
                >
                  <circle
                    cx="80"
                    cy="80"
                    r={ringRadius}
                    fill="none"
                    stroke="rgba(99, 102, 241, 0.16)"
                    strokeWidth="5"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r={ringRadius}
                    fill="none"
                    stroke={timer.paused ? '#f59e0b' : '#818cf8'}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringDashOffset}
                    className="transition-[stroke-dashoffset,stroke] duration-700 ease-linear"
                  />
                </svg>

                <div className="relative flex flex-col items-center justify-center text-center px-2">
                  <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-300/85">
                    {timer.paused ? 'PAUSED' : 'FOCUS'}
                  </span>
                  <span className="mt-0.5 font-mono text-2xl font-bold tracking-tight tabular-nums text-white drop-shadow-[0_0_12px_rgba(129,140,248,0.55)]">
                    {formatTimerClock(timer.remainingSeconds)}
                  </span>
                  <span className="mt-0.5 max-w-[96px] truncate text-[10px] font-medium text-indigo-200/85">
                    {timer.label}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {onTogglePauseTimer && (
                  <button
                    type="button"
                    onClick={onTogglePauseTimer}
                    title={timer.paused ? 'Resume focus timer' : 'Pause focus timer'}
                    aria-label={timer.paused ? 'Resume focus timer' : 'Pause focus timer'}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 border border-indigo-400/35 text-indigo-100 hover:bg-indigo-500/35 transition-colors"
                  >
                    {timer.paused ? (
                      <Play className="h-3.5 w-3.5" />
                    ) : (
                      <Pause className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                {onAddFiveMinutes && (
                  <button
                    type="button"
                    onClick={onAddFiveMinutes}
                    title="Add 5 minutes"
                    className="flex h-8 items-center gap-0.5 rounded-lg bg-indigo-500/15 border border-indigo-400/30 px-2 font-mono text-[11px] tabular-nums text-indigo-100 hover:bg-indigo-500/30 transition-colors whitespace-nowrap"
                  >
                    <Plus className="h-3 w-3" />
                    5m
                  </button>
                )}
                {onToggleFocusAudio && (
                  <button
                    type="button"
                    onClick={onToggleFocusAudio}
                    title={
                      focusAudioActive
                        ? 'Stop Sci-Fi Focus Hum'
                        : 'Play Sci-Fi Focus Hum'
                    }
                    aria-label={
                      focusAudioActive
                        ? 'Stop Sci-Fi Focus Hum'
                        : 'Play Sci-Fi Focus Hum'
                    }
                    className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                      focusAudioActive
                        ? 'bg-indigo-400/30 border-indigo-300/60 text-white'
                        : 'bg-white/[0.04] border-white/15 text-indigo-200 hover:bg-indigo-500/20'
                    }`}
                  >
                    <AudioLines className="h-3.5 w-3.5" />
                  </button>
                )}
                {onStopTimer && (
                  <button
                    type="button"
                    onClick={onStopTimer}
                    title="Stop focus timer"
                    aria-label="Stop focus timer"
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] border border-white/12 text-slate-300 hover:bg-rose-500/20 hover:border-rose-400/40 hover:text-rose-200 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </section>
          )}

          <div
            aria-hidden="true"
            className="pointer-events-none fixed right-3 top-[42%] sm:right-7 sm:top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1"
          >
            <div className="relative h-20 w-20 sm:h-28 sm:w-28">
              <canvas ref={canvasRef} className="h-full w-full" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span
                  className={`font-mono text-[8px] sm:text-[9px] font-semibold tracking-[0.16em] ${
                    isWarmMood
                      ? 'text-rose-200/85'
                      : isFocus
                        ? 'text-indigo-200/90'
                        : isActive
                          ? 'text-cyan-200/90'
                          : 'text-sky-300/60'
                  }`}
                >
                  {assistantState === 'speaking'
                    ? 'VOICE'
                    : isFocus
                      ? 'FOCUS'
                      : isActive
                        ? 'AUDIO'
                        : 'IDLE'}
                </span>
                <span className="font-mono text-[7px] sm:text-[8px] tracking-[0.14em] text-amber-300/70">
                  {assistantState === 'speaking'
                    ? 'LIVE'
                    : bootSequenceActive
                      ? 'SYNC'
                      : isActive || isFocus
                        ? 'READY'
                        : '00 dB'}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
