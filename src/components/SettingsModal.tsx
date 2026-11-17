import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFAULT_TAMPI_PERSONA,
  defaultVoice,
  LiveVoiceName,
  TampiSettings,
  VrmMetadata,
} from '../types/tampi';

interface SettingsModalProps {
  open: boolean;
  settings: TampiSettings;
  vrmMetadata: VrmMetadata | null;
  vrmUploading: boolean;
  userEmail: string | null;
  userDisplayName: string | null;
  authLoading: boolean;
  onSignIn: () => void;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<TampiSettings>) => void;
  onUploadVrm: (file: File) => void;
  onClearVrm: () => void;
}

const LIVE_VOICES: { id: LiveVoiceName; hint: string }[] = [
  { id: 'Kore', hint: 'Clear & expressive (Default)' },
  { id: 'Zephyr', hint: 'Bright & warm' },
  { id: 'Puck', hint: 'Playful & upbeat' },
  { id: 'Fenrir', hint: 'Deep & steady' },
  { id: 'Charon', hint: 'Calm & mellow' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  vrmMetadata,
  vrmUploading,
  userEmail,
  userDisplayName,
  authLoading,
  onSignIn,
  onClose,
  onUpdateSettings,
  onUploadVrm,
  onClearVrm,
}) => {
  const vrmInputRef = useRef<HTMLInputElement | null>(null);
  const [glbUrlInput, setGlbUrlInput] = useState(settings.customGlbUrl);
  const [showWakePhrase, setShowWakePhrase] = useState(false);
  const [showShutdownPhrase, setShowShutdownPhrase] = useState(false);

  useEffect(() => {
    setGlbUrlInput(settings.customGlbUrl);
  }, [settings.customGlbUrl]);

  useEffect(() => {
    if (!open) {
      setShowWakePhrase(false);
      setShowShutdownPhrase(false);
    }
  }, [open]);

  if (!open) return null;

  const handleVrmFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUploadVrm(file);
    e.target.value = '';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tampi Settings"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="flex max-h-[88vh] w-full max-w-[600px] flex-col rounded-2xl bg-[#0d1320] border border-white/12 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">
              Tampi Studio Settings
            </h2>
            <p className="text-xs text-slate-400">
              Customize your private voice codes, 3D .vrm avatar, live voice, and persona
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* 0. Private Account & Database Isolation Status */}
          <section className="rounded-xl bg-[#080c15] border border-white/10 p-3.5">
            {userEmail ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-100">
                      Private Vault: {userDisplayName || userEmail}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      Isolated under your encrypted account ({userEmail})
                    </p>
                  </div>
                </div>
                <span className="flex items-center gap-1 rounded-lg bg-emerald-500/12 border border-emerald-400/30 px-2.5 py-1 text-[11px] font-medium text-emerald-200 shrink-0">
                  <Lock className="h-3 w-3" />
                  <span>Private</span>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-200">
                    Guest Mode (Local Storage Only)
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Sign in with Google to isolate &amp; sync your secret codes, memories, and chat history privately.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={authLoading}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-cyan-500 px-3.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>{authLoading ? 'Signing in...' : 'Sign in with Google'}</span>
                </button>
              </div>
            )}
          </section>

          {/* 1. Custom .vrm Avatar Loader (IndexedDB) */}
          <section className="space-y-3 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  3D Avatar Model (.vrm)
                </h3>
                <p className="text-xs text-slate-400">
                  {vrmMetadata
                    ? `${vrmMetadata.name} · ${formatBytes(vrmMetadata.size)} (IndexedDB)`
                    : settings.customGlbUrl
                      ? 'Custom .vrm / .glb URL active'
                      : 'Upload your .vrm avatar or place public/tampi.vrm'}
                </p>
              </div>
              {(vrmMetadata || settings.customGlbUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    setGlbUrlInput('');
                    onUpdateSettings({ customGlbUrl: '' });
                    onClearVrm();
                  }}
                  className="text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors whitespace-nowrap shrink-0"
                >
                  Remove Custom .vrm
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={vrmInputRef}
                type="file"
                accept=".vrm"
                onChange={handleVrmFileSelect}
                className="hidden"
              />
              <button
                type="button"
                disabled={vrmUploading}
                onClick={() => vrmInputRef.current?.click()}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-cyan-500/15 border border-cyan-400/40 px-4 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                {vrmUploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving .vrm...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5 text-cyan-300" />
                    <span>{vrmMetadata ? 'Swap .vrm Avatar File' : 'Upload .vrm Avatar File'}</span>
                  </>
                )}
              </button>
              <span className="text-[11px] text-slate-400">
                Supports VRoid / VRM avatars with auto sleep pose &amp; lip-sync
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                type="text"
                value={glbUrlInput}
                onChange={(e) => setGlbUrlInput(e.target.value)}
                placeholder="Or paste optional .vrm / .glb model URL"
                className="h-9 flex-1 rounded-xl bg-[#080c15] border border-white/10 px-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ customGlbUrl: glbUrlInput.trim() })
                }
                className="h-9 rounded-xl bg-white/10 px-3.5 text-xs font-medium text-slate-100 hover:bg-white/18 transition-colors whitespace-nowrap shrink-0"
              >
                Apply URL
              </button>
            </div>
          </section>

          {/* 2. Gemini Live Voice */}
          <section className="space-y-3 border-t border-white/10 pt-5">
            <h3 className="text-sm font-semibold text-slate-200">
              Gemini Live Voice
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LIVE_VOICES.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => onUpdateSettings({ liveVoiceName: voice.id })}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    (settings.liveVoiceName || defaultVoice) === voice.id
                      ? 'bg-cyan-500/18 border-cyan-400/50 text-cyan-100'
                      : 'bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-semibold">{voice.id}</div>
                  <div className="text-[11px] text-slate-400">{voice.hint}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 3. Tampi Emotional Persona Instructions */}
          <section className="space-y-2.5 border-t border-white/10 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                Tampi Persona &amp; Emotions
              </h3>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    personaInstructions: DEFAULT_TAMPI_PERSONA,
                  })
                }
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Default</span>
              </button>
            </div>
            <textarea
              rows={6}
              value={settings.personaInstructions}
              onChange={(e) =>
                onUpdateSettings({ personaInstructions: e.target.value })
              }
              className="custom-scrollbar w-full rounded-xl bg-[#080c15] border border-white/12 p-3 text-xs leading-relaxed text-slate-200 focus:border-cyan-400/50 focus:outline-none"
            />
          </section>

          {/* 4. Masked Secret Wake & Shutdown Phrases (Hands-Free Standby & Sleep) */}
          <section className="space-y-4 border-t border-white/10 pt-5">
            <div className="space-y-2.5">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Secret Wake Phrase
                </h3>
                <p className="text-[11px] text-slate-400">
                  Masked for privacy · Separate multiple phrases with commas or / (Bengali &amp; English)
                </p>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showWakePhrase ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.secretWakePhrase}
                  onChange={(e) =>
                    onUpdateSettings({ secretWakePhrase: e.target.value })
                  }
                  placeholder="Enter your secret wake phrases (separated by commas or /)"
                  aria-label="Secret Wake Phrase"
                  className="h-10 w-full rounded-xl bg-[#080c15] border border-white/12 pl-3 pr-10 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowWakePhrase((v) => !v)}
                  aria-label={
                    showWakePhrase
                      ? 'Hide secret wake phrase'
                      : 'Show secret wake phrase'
                  }
                  title={
                    showWakePhrase
                      ? 'Hide secret wake phrase'
                      : 'Show secret wake phrase'
                  }
                  className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-cyan-200 transition-colors"
                >
                  {showWakePhrase ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Secret Shutdown Phrase
                </h3>
                <p className="text-[11px] text-slate-400">
                  Masked for privacy · Say any phrase during a live call to put Tampi into standby sleep
                </p>
              </div>
              <div className="relative flex items-center">
                <input
                  type={showShutdownPhrase ? 'text' : 'password'}
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.secretShutdownPhrase}
                  onChange={(e) =>
                    onUpdateSettings({ secretShutdownPhrase: e.target.value })
                  }
                  placeholder="Enter your secret shutdown phrases (separated by commas or /)"
                  aria-label="Secret Shutdown Phrase"
                  className="h-10 w-full rounded-xl bg-[#080c15] border border-white/12 pl-3 pr-10 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowShutdownPhrase((v) => !v)}
                  aria-label={
                    showShutdownPhrase
                      ? 'Hide secret shutdown phrase'
                      : 'Show secret shutdown phrase'
                  }
                  title={
                    showShutdownPhrase
                      ? 'Hide secret shutdown phrase'
                      : 'Show secret shutdown phrase'
                  }
                  className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-amber-200 transition-colors"
                >
                  {showShutdownPhrase ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-white/10 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-cyan-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
