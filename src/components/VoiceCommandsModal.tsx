import React, { useEffect, useState } from 'react';
import {
  Check,
  Lock,
  Mic,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { parseVoicePhraseList } from '../utils/wakeWord';

interface VoiceCommandsModalProps {
  open: boolean;
  secretWakePhrase: string;
  secretShutdownPhrase: string;
  isSignedIn: boolean;
  isFirstTimeSetup?: boolean;
  userEmail: string | null;
  onClose: () => void;
  onSave: (nextWakePhrase: string, nextShutdownPhrase: string) => void;
}

export const VoiceCommandsModal: React.FC<VoiceCommandsModalProps> = ({
  open,
  secretWakePhrase,
  secretShutdownPhrase,
  isSignedIn,
  isFirstTimeSetup = false,
  userEmail,
  onClose,
  onSave,
}) => {
  const [wakeDraft, setWakeDraft] = useState(secretWakePhrase);
  const [shutdownDraft, setShutdownDraft] = useState(secretShutdownPhrase);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setWakeDraft(secretWakePhrase);
      setShutdownDraft(secretShutdownPhrase);
      setValidationError(null);
    } else {
      setValidationError(null);
    }
  }, [open, secretWakePhrase, secretShutdownPhrase]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanWake = wakeDraft.trim();
    const cleanShutdown = shutdownDraft.trim();

    if (parseVoicePhraseList(cleanWake).length === 0) {
      setValidationError('Please enter at least one Wake Phrase.');
      return;
    }
    if (parseVoicePhraseList(cleanShutdown).length === 0) {
      setValidationError('Please enter at least one Off/Sleep Phrase.');
      return;
    }

    setValidationError(null);
    onSave(cleanWake, cleanShutdown);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice Commands"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4"
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-[500px] flex-col rounded-2xl bg-[#0d1320] border border-white/12 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-400/35 shrink-0">
              <Mic className="h-4 w-4 text-cyan-300" />
              <Lock className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#0d1320] p-[1px] text-amber-300" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                {isFirstTimeSetup
                  ? 'Set Your Personal Voice Codes'
                  : 'Voice Commands'}
              </h2>
              <p className="text-xs text-slate-400">
                {isFirstTimeSetup
                  ? 'Create your personal Wake & Off/Sleep phrases to activate Standby Mode'
                  : 'Set your personal wake & off/sleep voice phrases'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close voice commands"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {isFirstTimeSetup && (
            <div className="flex items-start gap-2.5 rounded-xl bg-cyan-500/10 border border-cyan-400/30 px-3.5 py-2.5 text-xs text-cyan-100">
              <Sparkles className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
              <span>
                First-time setup: Tampi waits in Standby until you save your own Wake Phrase and Off/Sleep Phrase.
              </span>
            </div>
          )}

          {/* Isolation Status Strip */}
          <div className="flex items-center justify-between gap-2 rounded-xl bg-[#080c15] border border-white/10 px-3.5 py-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck
                className={`h-4 w-4 shrink-0 ${
                  isSignedIn ? 'text-emerald-400' : 'text-cyan-400'
                }`}
              />
              <span className="truncate text-slate-300">
                {isSignedIn
                  ? `Private Firestore Vault (${userEmail ?? 'Signed In'})`
                  : 'Local Device Storage · Sign in to sync privately'}
              </span>
            </div>
            <Lock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
          </div>

          {/* Start Command (Wake Phrase) */}
          <div className="space-y-2">
            <label
              htmlFor="voice-cmd-wake"
              className="block text-sm font-semibold text-slate-200"
            >
              Wake Phrase (Start Command)
            </label>
            <input
              id="voice-cmd-wake"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={wakeDraft}
              onChange={(e) => {
                setWakeDraft(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="e.g. hello tampi, wake up"
              className="h-10 w-full rounded-xl bg-[#080c15] border border-white/12 px-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400">
              Speak this while Tampi is sleeping to wake her up. Separate multiple phrases with commas or /.
            </p>
          </div>

          {/* End Command (Off/Sleep Phrase) */}
          <div className="space-y-2">
            <label
              htmlFor="voice-cmd-shutdown"
              className="block text-sm font-semibold text-slate-200"
            >
              Off/Sleep Phrase (End Command)
            </label>
            <input
              id="voice-cmd-shutdown"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={shutdownDraft}
              onChange={(e) => {
                setShutdownDraft(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="e.g. go to sleep, goodbye tampi"
              className="h-10 w-full rounded-xl bg-[#080c15] border border-white/12 px-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-400/50 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400">
              Speak this as a standalone command during a live call to put Tampi back into sleeping standby mode. Separate multiple phrases with commas or /.
            </p>
          </div>

          {validationError && (
            <p className="rounded-xl bg-rose-500/12 border border-rose-400/35 px-3 py-2 text-xs text-rose-200">
              {validationError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-white/10 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/[0.06] border border-white/10 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/12 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-xl bg-cyan-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Save Commands</span>
          </button>
        </div>
      </form>
    </div>
  );
};
