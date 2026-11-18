import React, { useState } from 'react';
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  History,
  Mic,
  MicOff,
  Radio,
  Send,
  Square,
  X,
} from 'lucide-react';
import {
  AssistantState,
  AvatarEmotion,
  ChatTurn,
  LanguageCode,
  SearchSource,
} from '../types/tampi';

interface VoiceDockProps {
  assistantState: AssistantState;
  emotion?: AvatarEmotion;
  language: LanguageCode;
  liveConnected: boolean;
  liveMuted: boolean;
  standbyWakeEnabled: boolean;
  standbyListening: boolean;
  standbyAudioDetected?: boolean;
  standbyHeardText?: string;
  micPermissionNeeded: boolean;
  needsVoiceCodeSetup?: boolean;
  focusMode?: boolean;
  focusAudioActive?: boolean;
  securityAlertActive?: boolean;
  searchQuery?: string | null;
  searchSources?: SearchSource[];
  captionText: string;
  interimTranscript: string;
  history: ChatTurn[];
  userFirstName: string;
  onToggleMute: () => void;
  onToggleStandbyWake: () => void;
  onToggleFocusAudio?: () => void;
  onDismissSearch?: () => void;
  onStopSpeaking: () => void;
  onChangeLanguage: (lang: LanguageCode) => void;
  onSendText: (text: string) => void;
}

export const VoiceDock: React.FC<VoiceDockProps> = ({
  assistantState,
  emotion = 'neutral',
  language,
  liveConnected,
  liveMuted,
  standbyWakeEnabled,
  standbyListening,
  standbyAudioDetected = false,
  standbyHeardText = '',
  micPermissionNeeded,
  needsVoiceCodeSetup = false,
  focusMode = false,
  focusAudioActive = false,
  securityAlertActive = false,
  searchQuery = null,
  searchSources = [],
  history,
  userFirstName,
  onToggleMute,
  onToggleStandbyWake,
  onToggleFocusAudio,
  onDismissSearch,
  onStopSpeaking,
  onChangeLanguage,
  onSendText,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [draft, setDraft] = useState('');

  const isSpeaking = assistantState === 'speaking';
  const isThinking = assistantState === 'thinking';
  const isActive = liveConnected || assistantState !== 'idle';
  const isWarmMood =
    emotion === 'sulking' || emotion === 'angry' || emotion === 'sad';
  const isFocus = focusMode && !isWarmMood;

  const dockFrameClass = isWarmMood
    ? 'bg-[#140a14]/76 border-rose-400/40 shadow-[0_0_28px_rgba(244,63,94,0.18)]'
    : isFocus
      ? 'bg-[#080b1f]/78 border-indigo-400/45 shadow-[0_0_32px_rgba(99,102,241,0.22)]'
      : isActive
        ? 'bg-[#06101f]/72 border-cyan-400/40 shadow-[0_0_32px_rgba(34,211,238,0.18)]'
        : 'bg-[#060d1b]/68 border-cyan-400/25 shadow-[0_0_26px_rgba(14,165,233,0.12)]';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setDraft('');
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center px-4 pb-4 sm:pb-5">
      {/* Live Google Search Grounding Sources Bar */}
      {!collapsed && (searchQuery || searchSources.length > 0) && (
        <div className="pointer-events-auto mb-2.5 w-full max-w-[760px] rounded-xl backdrop-blur-xl bg-[#071122]/86 border border-cyan-400/30 px-3.5 py-2.5 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Globe className="h-3.5 w-3.5 text-cyan-300 shrink-0" />
              <span className="text-xs font-medium text-cyan-100 truncate">
                {searchQuery && searchSources.length === 0
                  ? `Searching live web: ${searchQuery}`
                  : searchQuery
                    ? `Live Google Search · ${searchQuery}`
                    : 'Live Google Search Sources'}
              </span>
            </div>
            {onDismissSearch && (
              <button
                type="button"
                onClick={onDismissSearch}
                aria-label="Dismiss search sources"
                className="text-slate-400 hover:text-white transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {searchSources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {searchSources.slice(0, 4).map((src) => (
                <a
                  key={src.uri}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[230px] items-center gap-1 rounded-lg bg-white/[0.06] border border-white/10 px-2.5 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/15 hover:border-cyan-400/35 transition-colors"
                >
                  <span className="truncate">{src.title}</span>
                  <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-75" />
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Expandable Recent Conversation Transcript */}
      {showTranscript && !collapsed && (
        <div
          className={`pointer-events-auto mb-3 w-full max-w-[760px] rounded-2xl backdrop-blur-xl border p-4 transition-colors duration-500 ${dockFrameClass}`}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              Recent Conversation
            </span>
            <button
              type="button"
              onClick={() => setShowTranscript(false)}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
          <div className="custom-scrollbar max-h-48 space-y-2.5 overflow-y-auto pr-1">
            {history.length === 0 ? (
              <p className="text-xs text-slate-500">
                No conversation turns yet. Say your voice code to wake Tampi, or send a message below.
              </p>
            ) : (
              history.map((turn) => (
                <div
                  key={turn.id}
                  className={`flex flex-col gap-0.5 text-xs ${
                    turn.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <span className="text-[11px] text-slate-500">
                    {turn.role === 'user' ? userFirstName || 'You' : 'Tampi'}
                  </span>
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 leading-relaxed ${
                      turn.role === 'user'
                        ? 'bg-cyan-500/15 text-cyan-100 border border-cyan-500/20'
                        : 'bg-white/[0.05] text-slate-200 border border-white/10'
                    }`}
                  >
                    {turn.text}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Steady Standby Status Pill (zero flickering on background SpeechRecognition restarts) */}
      {!liveConnected && !collapsed && (
        <button
          type="button"
          disabled={!micPermissionNeeded}
          onClick={() => {
            if (micPermissionNeeded) {
              onToggleStandbyWake();
            }
          }}
          className={`pointer-events-auto mb-2 flex max-w-[92vw] items-center gap-2.5 rounded-full backdrop-blur-xl bg-[#071122]/72 border px-3.5 py-1.5 shadow-[0_0_22px_rgba(34,211,238,0.16)] ${
            securityAlertActive
              ? 'border-rose-500/80 bg-[#1a0810]/85 shadow-[0_0_26px_rgba(244,63,94,0.45)]'
              : micPermissionNeeded
                ? 'border-amber-400/50 cursor-pointer hover:bg-amber-500/15'
                : standbyWakeEnabled
                  ? 'border-cyan-400/35 cursor-default'
                  : 'border-white/15 cursor-default'
          }`}
        >
          <span className="relative flex h-4 w-4 items-center justify-center shrink-0">
            <span
              className={`absolute inset-0 rounded-full border ${
                securityAlertActive
                  ? 'border-rose-400 animate-ping'
                  : micPermissionNeeded
                    ? 'border-amber-400 opacity-75'
                    : standbyWakeEnabled && !needsVoiceCodeSetup
                      ? 'border-cyan-400 standby-ring-breath'
                      : 'border-cyan-400 opacity-35'
              }`}
            />
            <span
              className={`h-2 w-2 rounded-full ${
                securityAlertActive
                  ? 'bg-rose-400'
                  : micPermissionNeeded
                    ? 'bg-amber-400/70'
                    : standbyWakeEnabled && !needsVoiceCodeSetup
                      ? 'border border-cyan-300 bg-cyan-400/40'
                      : 'bg-slate-500'
              }`}
            />
          </span>
          <span
            className={`text-xs font-medium tracking-wide whitespace-nowrap ${
              securityAlertActive
                ? 'text-rose-200'
                : micPermissionNeeded
                  ? 'text-amber-200'
                  : standbyWakeEnabled
                    ? 'text-cyan-200'
                    : 'text-slate-400'
            }`}
          >
            {securityAlertActive
              ? 'Access denied • Confirm your identity'
              : standbyHeardText
                ? `Heard: "${standbyHeardText}"`
                : isThinking
                  ? 'Verifying & connecting...'
                  : needsVoiceCodeSetup
                    ? 'Set your private voice codes first'
                    : micPermissionNeeded
                      ? 'Tap anywhere to enable voice standby'
                      : standbyWakeEnabled
                        ? 'Standby • Speak your secret wake code'
                        : 'Standby listener muted'}
          </span>

          {standbyListening && standbyAudioDetected && !micPermissionNeeded && (
            <span
              title="Microphone audio detected"
              className="relative flex h-2 w-2 shrink-0"
            >
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            </span>
          )}
        </button>
      )}

      {/* Collapse / Expand Toggle Handle */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="pointer-events-auto mb-1.5 flex items-center gap-1.5 rounded-lg backdrop-blur-xl bg-[#071122]/70 border border-cyan-400/25 px-3 py-1 text-[11px] font-medium text-cyan-200/80 hover:border-cyan-400/45 hover:text-white transition-colors whitespace-nowrap shrink-0"
      >
        {collapsed ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            <span>Show Controls</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            <span>Hide Controls</span>
          </>
        )}
      </button>

      {/* Main Collapsible Bottom Control Dock (100% Hands-Free Voice Activation & Sleep) */}
      {!collapsed && (
        <div
          className={`pointer-events-auto w-full max-w-[820px] rounded-2xl backdrop-blur-xl border p-3 transition-colors duration-500 ${dockFrameClass}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Voice Status & Minimal Mic-Permission / Mute Controls */}
            <div className="flex items-center gap-2">
              {liveConnected ? (
                <>
                  <div className="flex h-10 items-center gap-2 rounded-xl bg-emerald-500/12 border border-emerald-400/35 px-3 text-xs font-medium text-emerald-200 whitespace-nowrap shrink-0">
                    <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                    <span>Live · Speak your secret sleep code to standby</span>
                  </div>

                  <button
                    type="button"
                    onClick={onToggleMute}
                    aria-label={liveMuted ? 'Unmute microphone' : 'Mute microphone'}
                    className={`flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      liveMuted
                        ? 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                        : 'bg-white/[0.05] border-white/12 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {liveMuted ? (
                      <>
                        <MicOff className="h-4 w-4" />
                        <span>Muted</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-4 w-4 text-cyan-400" />
                        <span>Live Mic</span>
                      </>
                    )}
                  </button>

                  {isSpeaking && (
                    <button
                      type="button"
                      onClick={onStopSpeaking}
                      className="flex h-10 items-center gap-2 rounded-xl bg-amber-500/20 border border-amber-400/40 px-3.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span>Stop Speaking</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onToggleStandbyWake}
                    aria-pressed={standbyWakeEnabled && !micPermissionNeeded}
                    title={
                      micPermissionNeeded
                        ? 'Enable microphone permission & audio for hands-free voice code'
                        : standbyWakeEnabled
                          ? 'Mute standby voice-code listener'
                          : 'Unmute standby voice-code listener'
                    }
                    aria-label={
                      micPermissionNeeded
                        ? 'Enable microphone permission'
                        : standbyWakeEnabled
                          ? 'Mute standby listener'
                          : 'Unmute standby listener'
                    }
                    className={`flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      micPermissionNeeded
                        ? 'bg-amber-500/20 border-amber-400/55 text-amber-200 hover:bg-amber-500/30 animate-pulse'
                        : standbyWakeEnabled
                          ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/25'
                          : 'bg-white/[0.04] border-white/12 text-slate-400 hover:text-white'
                    }`}
                  >
                    {micPermissionNeeded ? (
                      <>
                        <Mic className="h-4 w-4 text-amber-300" />
                        <span>Enable Mic</span>
                      </>
                    ) : standbyWakeEnabled ? (
                      <Mic className="h-4 w-4 text-cyan-300" />
                    ) : (
                      <MicOff className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {isThinking
                      ? 'Connecting live session...'
                      : micPermissionNeeded
                        ? 'Tap anywhere to enable voice standby'
                        : standbyWakeEnabled
                          ? 'Hands-free voice activation ready'
                          : 'Standby listener muted'}
                  </span>
                </>
              )}
            </div>

            {/* Language Context, Focus Hum & Transcript Toggle */}
            <div className="flex items-center gap-2">
              {onToggleFocusAudio && (
                <button
                  type="button"
                  onClick={onToggleFocusAudio}
                  aria-pressed={focusAudioActive}
                  title={
                    focusAudioActive
                      ? 'Stop Sci-Fi Focus Hum'
                      : 'Play Sci-Fi Focus Hum'
                  }
                  aria-label="Toggle Sci-Fi Focus Hum"
                  className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    focusAudioActive
                      ? 'bg-indigo-500/25 border-indigo-400/55 text-indigo-100'
                      : 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  <AudioLines className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Focus Hum</span>
                </button>
              )}

              <div
                className="flex h-10 items-center rounded-xl bg-white/[0.04] border border-white/10 p-1"
                role="group"
                aria-label="Conversation language preference"
              >
                <button
                  type="button"
                  onClick={() => onChangeLanguage('bn-BD')}
                  className={`h-8 rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    language === 'bn-BD'
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  BN
                </button>
                <button
                  type="button"
                  onClick={() => onChangeLanguage('en-US')}
                  className={`h-8 rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    language === 'en-US'
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  EN
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowTranscript((prev) => !prev)}
                aria-label="Toggle transcript history"
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors shrink-0 ${
                  showTranscript
                    ? 'bg-white/15 border-white/25 text-white'
                    : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <History className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick Text Input Bar */}
          <form onSubmit={handleSubmit} className="mt-2.5 flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                language === 'bn-BD'
                  ? 'বাংলায় বা Banglish-এ Tampi-কে কিছু লিখো...'
                  : 'Message Tampi, set a 25m study timer, or save a memory...'
              }
              className="h-10 flex-1 rounded-xl bg-white/[0.04] border border-cyan-400/20 px-3.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/55 focus:outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!draft.trim() || (isThinking && !liveConnected)}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-cyan-500/15 border border-cyan-400/30 px-3.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
