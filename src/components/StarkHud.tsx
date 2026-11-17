import React, { useEffect, useRef } from 'react';
import { AssistantState, AvatarEmotion } from '../types/tampi';

interface StarkHudProps {
  assistantState: AssistantState;
  emotion: AvatarEmotion;
  liveConnected: boolean;
  standbyListening: boolean;
  bootSequenceActive: boolean;
  wakePulseKey: number;
  miniWidget?: boolean;
  getAudioSpectrum: (bins: Uint8Array<ArrayBuffer>) => boolean;
}

export const StarkHud: React.FC<StarkHudProps> = ({
  assistantState,
  emotion,
  liveConnected,
  standbyListening,
  bootSequenceActive,
  wakePulseKey,
  miniWidget = false,
  getAudioSpectrum,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<AssistantState>(assistantState);
  const emotionRef = useRef<AvatarEmotion>(emotion);
  const liveConnectedRef = useRef<boolean>(liveConnected);
  const bootRef = useRef<boolean>(bootSequenceActive);
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
    getSpectrumRef.current = getAudioSpectrum;
  }, [getAudioSpectrum]);

  const isActive =
    bootSequenceActive || liveConnected || assistantState !== 'idle';
  const isSulky =
    isActive && (emotion === 'sulking' || emotion === 'angry');

  const bracketColorClass = isSulky
    ? 'border-rose-400/55 shadow-[0_0_12px_rgba(244,63,94,0.28)]'
    : isActive
      ? 'border-cyan-400/65 shadow-[0_0_14px_rgba(34,211,238,0.3)]'
      : 'border-sky-500/35 shadow-[0_0_10px_rgba(14,165,233,0.16)]';

  const cornerAccentClass = isSulky
    ? 'bg-amber-400/70'
    : isActive
      ? 'bg-amber-400/80'
      : 'bg-sky-400/40';

  const telemetryStatusLabel = bootSequenceActive
    ? 'BOOTING'
    : liveConnected || assistantState !== 'idle'
      ? 'ACTIVE'
      : 'STANDBY';

  const telemetryToneClass = isSulky
    ? 'text-rose-300/90'
    : isActive
      ? 'text-cyan-300/95'
      : standbyListening
        ? 'text-sky-300/75'
        : 'text-slate-400/75';

  // Ambient viewport edge glow (shifts Standby deep-blue -> Active cyan/gold -> Sulky rose/amber)
  const ambientGlowStyle = isSulky
    ? 'radial-gradient(circle at 50% 44%, rgba(244, 63, 94, 0.14) 0%, rgba(245, 158, 11, 0.08) 38%, transparent 72%)'
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
      const activeMode = booting || connected || mode !== 'idle';
      const sulkyMode = activeMode && (emo === 'sulking' || emo === 'angry');

      const hasAudio = getSpectrumRef.current(bins);
      const isSpeaking = mode === 'speaking' && hasAudio;

      const primaryRgb = sulkyMode
        ? '251, 113, 133'
        : activeMode
          ? '34, 211, 238'
          : '56, 189, 248';
      const accentRgb = sulkyMode ? '245, 158, 11' : '245, 158, 11';

      // Outer subtle segmented ring
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * (booting ? 2.6 : activeMode ? 0.35 : 0.12));
      ctx.lineWidth = Math.max(1, minDim * 0.011);

      for (let s = 0; s < 3; s++) {
        const startAngle = (s * Math.PI * 2) / 3 + 0.14;
        const endAngle = startAngle + (Math.PI * 2) / 3 - 0.34;
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius + maxBarLen + minDim * 0.032, startAngle, endAngle);
        ctx.strokeStyle =
          s === 0 && activeMode
            ? `rgba(${accentRgb}, 0.52)`
            : `rgba(${primaryRgb}, ${activeMode ? 0.42 : 0.22})`;
        ctx.stroke();
      }
      ctx.restore();

      // Inner crisp base circle
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius - minDim * 0.015, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, minDim * 0.01);
      ctx.strokeStyle = `rgba(${primaryRgb}, ${activeMode ? 0.55 : 0.28})`;
      ctx.stroke();

      // Radial audio spectrum bars
      let energySum = 0;
      for (let i = 0; i < barCount; i++) {
        let targetVal = 0.06;
        if (isSpeaking) {
          // Map lower-to-mid voice frequencies cleanly around the ring (mirrored/folded for balanced visual)
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
        if (val > 0.62 && activeMode) {
          ctx.strokeStyle = `rgba(${accentRgb}, ${0.75 + val * 0.25})`;
        } else {
          ctx.strokeStyle = `rgba(${primaryRgb}, ${activeMode ? 0.45 + val * 0.52 : 0.28 + val * 0.35})`;
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
        `rgba(${primaryRgb}, ${activeMode ? 0.14 + avgEnergy * 0.22 : 0.06})`,
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

  return (
    <>
      {/* Ambient State & Mood Radial Glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] transition-opacity duration-700"
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

      {/* Subtle Micro-Telemetry & Right-Side Circular Audio Spectrum Visualizer */}
      {!miniWidget && (
        <>
          <div className="pointer-events-none fixed left-6 top-14 sm:left-8 sm:top-[60px] z-10 flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] tabular-nums">
            <span className="text-slate-500">NEURAL LINK:</span>
            <span className={`font-semibold transition-colors duration-500 ${telemetryToneClass}`}>
              {telemetryStatusLabel}
            </span>
            {isSulky && (
              <>
                <span className="text-slate-600" aria-hidden="true">
                  /
                </span>
                <span className="text-amber-300/85">OVIMAN</span>
              </>
            )}
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none fixed right-3 top-[42%] sm:right-7 sm:top-1/2 -translate-y-1/2 z-10 flex flex-col items-center gap-1"
          >
            <div className="relative h-20 w-20 sm:h-28 sm:w-28">
              <canvas ref={canvasRef} className="h-full w-full" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span
                  className={`font-mono text-[8px] sm:text-[9px] font-semibold tracking-[0.16em] ${
                    isSulky
                      ? 'text-rose-200/85'
                      : isActive
                        ? 'text-cyan-200/90'
                        : 'text-sky-300/60'
                  }`}
                >
                  {assistantState === 'speaking'
                    ? 'VOICE'
                    : isActive
                      ? 'AUDIO'
                      : 'IDLE'}
                </span>
                <span className="font-mono text-[7px] sm:text-[8px] tracking-[0.14em] text-amber-300/70">
                  {assistantState === 'speaking'
                    ? 'LIVE'
                    : bootSequenceActive
                      ? 'SYNC'
                      : isActive
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
