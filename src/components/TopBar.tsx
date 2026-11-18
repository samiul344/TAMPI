import React from 'react';
import {
  AudioLines,
  Lock,
  LogIn,
  LogOut,
  Mic,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  StickyNote,
  Timer,
} from 'lucide-react';
import { AssistantState, StudyTimerState } from '../types/tampi';

interface TopBarProps {
  assistantState: AssistantState;
  voiceMode?: 'browser' | 'live';
  timer: StudyTimerState;
  memoryCount?: number;
  noteCount: number;
  pendingTaskCount?: number;
  focusAudioActive?: boolean;
  userDisplayName: string | null;
  userPhotoUrl: string | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onTogglePauseTimer: () => void;
  onAddFiveMinutes: () => void;
  onStopTimer: () => void;
  onToggleFocusAudio?: () => void;
  onOpenVoiceCommands: () => void;
  onOpenChat?: () => void;
  onOpenNotes: () => void;
  onOpenMemory?: () => void;
  onOpenSettings: () => void;
  onToggleMiniWidget?: () => void;
}

function formatSeconds(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const STATE_LABELS: Record<AssistantState, string> = {
  idle: 'Standby',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
};

const STATE_TEXT_COLORS: Record<AssistantState, string> = {
  idle: 'text-slate-400',
  listening: 'text-blue-400',
  thinking: 'text-purple-400',
  speaking: 'text-emerald-400',
};

export const TopBar: React.FC<TopBarProps> = ({
  assistantState,
  timer,
  noteCount,
  focusAudioActive = false,
  userDisplayName,
  userPhotoUrl,
  authLoading,
  onSignIn,
  onSignOut,
  onTogglePauseTimer,
  onAddFiveMinutes,
  onStopTimer,
  onToggleFocusAudio,
  onOpenVoiceCommands,
  onOpenNotes,
  onOpenSettings,
}) => {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-5 py-4 sm:px-7">
      {/* Zone 1: Brand Title & Clean Unboxed Status */}
      <div className="pointer-events-auto flex items-baseline gap-3">
        <h1 className="font-display text-xl font-semibold tracking-tight text-white whitespace-nowrap shrink-0">
          Tampi
        </h1>
        <span className="text-xs text-slate-600" aria-hidden="true">
          ·
        </span>
        <span
          className={`text-xs font-medium tracking-wide whitespace-nowrap shrink-0 transition-colors ${STATE_TEXT_COLORS[assistantState]}`}
        >
          {STATE_LABELS[assistantState]}
        </span>
        <span className="hidden sm:inline text-xs text-slate-600" aria-hidden="true">
          ·
        </span>
        <span className="hidden sm:inline text-xs text-slate-400 whitespace-nowrap shrink-0">
          Gemini Live
        </span>
      </div>

      {/* Zone 2: Floating Study Timer Widget (Visible when active) */}
      {timer.active && (
        <div className="pointer-events-auto hidden md:flex items-center gap-3 rounded-xl bg-[#0d1024]/94 border border-indigo-400/40 px-3.5 py-2 shadow-[0_0_24px_rgba(99,102,241,0.22)]">
          <Timer className="h-4 w-4 text-indigo-300 shrink-0" />
          <div className="flex items-baseline gap-2.5">
            <span className="max-w-[130px] truncate text-xs font-medium text-indigo-100">
              {timer.label}
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-indigo-200">
              {formatSeconds(timer.remainingSeconds)}
            </span>
          </div>
          <div className="flex items-center gap-1 border-l border-white/10 pl-2">
            <button
              type="button"
              onClick={onTogglePauseTimer}
              title={timer.paused ? 'Resume timer' : 'Pause timer'}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              {timer.paused ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={onAddFiveMinutes}
              title="Add 5 minutes"
              className="flex h-7 items-center gap-0.5 rounded-lg px-1.5 font-mono text-[11px] tabular-nums text-slate-300 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3 w-3" />
              5m
            </button>
            <button
              type="button"
              onClick={onStopTimer}
              title="Reset and close timer"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Zone 3: Account, Notes Vault, Chat, Memory & Settings Actions */}
      <div className="pointer-events-auto flex items-center gap-2 shrink-0">
        {userDisplayName ? (
          <div className="flex h-10 items-center gap-2 rounded-xl backdrop-blur-md bg-[#081224]/75 border border-cyan-400/20 pl-2 pr-1.5">
            {userPhotoUrl ? (
              <img
                src={userPhotoUrl}
                alt={userDisplayName}
                referrerPolicy="no-referrer"
                className="h-6 w-6 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/20 text-[11px] font-semibold text-cyan-200">
                {userDisplayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="hidden md:inline max-w-[110px] truncate text-xs font-medium text-slate-200">
              {userDisplayName.split(' ')[0]}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            disabled={authLoading}
            className="flex h-10 items-center gap-2 rounded-xl backdrop-blur-md bg-[#081224]/75 border border-cyan-400/25 px-3.5 text-xs font-medium text-slate-200 hover:border-cyan-400/50 hover:bg-[#0c1a33]/85 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <LogIn className="h-3.5 w-3.5 text-cyan-400" />
            <span>{authLoading ? 'Signing in...' : 'Sign in'}</span>
          </button>
        )}

        {onToggleFocusAudio && (
          <button
            type="button"
            onClick={onToggleFocusAudio}
            aria-pressed={focusAudioActive}
            aria-label={
              focusAudioActive ? 'Mute Focus Hum Audio' : 'Play Focus Hum Audio'
            }
            title={
              focusAudioActive
                ? 'Sci-Fi Focus Hum Active (Click to Stop)'
                : 'Play Sci-Fi Focus Hum'
            }
            className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full backdrop-blur-md border transition-colors shrink-0 ${
              focusAudioActive
                ? 'bg-indigo-500/25 border-indigo-400/60 text-indigo-200 shadow-[0_0_14px_rgba(99,102,241,0.35)]'
                : 'bg-[#081224]/75 border-cyan-400/20 text-slate-300 hover:border-indigo-400/45 hover:text-indigo-200'
            }`}
          >
            <AudioLines className="h-4 w-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onOpenNotes}
          aria-label={`Notes (${noteCount})`}
          title={`Smart Notes & Reminders (${noteCount})`}
          className="flex h-9 sm:h-10 items-center gap-1.5 rounded-full backdrop-blur-md bg-[#081224]/75 border border-amber-400/30 px-3 text-xs font-medium text-amber-100 hover:border-amber-300/60 hover:bg-[#0c1a33]/85 transition-colors whitespace-nowrap shrink-0"
        >
          <StickyNote className="h-3.5 w-3.5 text-amber-300 shrink-0" />
          <span>Notes</span>
          {noteCount > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-amber-300/90">
              {noteCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenVoiceCommands}
          aria-label="Voice Commands"
          title="Voice Commands"
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full backdrop-blur-md bg-[#081224]/75 border border-cyan-400/20 text-slate-200 hover:border-cyan-400/50 hover:bg-[#0c1a33]/85 transition-colors shrink-0"
        >
          <span className="relative inline-flex items-center justify-center">
            <Mic className="h-4 w-4 text-cyan-400" />
            <Lock className="h-2.5 w-2.5 -ml-1 mt-2 text-amber-300" />
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          aria-label="Settings"
          className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full backdrop-blur-md bg-[#081224]/75 border border-cyan-400/20 text-slate-200 hover:border-cyan-400/45 hover:bg-[#0c1a33]/85 transition-colors shrink-0"
        >
          <Settings className="h-4 w-4 text-slate-300" />
        </button>
      </div>
    </header>
  );
};
