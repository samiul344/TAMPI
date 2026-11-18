import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  MessageSquare,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  CHATBOT_ROLE_PRESETS,
  ChatbotMessage,
  ChatbotRoleId,
  ChatTaskMode,
  LanguageCode,
} from '../types/tampi';

interface ChatDrawerProps {
  open: boolean;
  messages: ChatbotMessage[];
  roleId: ChatbotRoleId;
  customSystemInstruction: string;
  taskMode: ChatTaskMode;
  language?: LanguageCode;
  tampiPersona: string;
  isStreaming: boolean;
  errorMessage: string | null;
  userFirstName: string;
  onClose: () => void;
  onChangeRole: (roleId: ChatbotRoleId) => void;
  onChangeCustomInstruction: (instruction: string) => void;
  onChangeTaskMode: (mode: ChatTaskMode) => void;
  onSendMessage: (text: string) => void;
  onStopStreaming: () => void;
  onClearThread: () => void;
}

const MODE_OPTIONS: { id: ChatTaskMode; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Routes fast, general, complex, or deep reasoning automatically' },
  { id: 'fast', label: 'Fast', hint: 'gemini-3.1-flash-lite · Minimal latency' },
  { id: 'general', label: 'General', hint: 'gemini-4-hydrogen · Balanced everyday chat' },
  { id: 'complex', label: 'Complex', hint: 'gemini-4-hydrogen · High reasoning for code & interactive tasks' },
  { id: 'reasoning', label: 'Deep', hint: 'gemini-4-hydrogen · Maximum XHIGH reasoning depth' },
];

const MODE_LABELS: Record<Exclude<ChatTaskMode, 'auto'>, string> = {
  fast: 'Fast',
  general: 'General',
  complex: 'Complex',
  reasoning: 'Deep Reasoning',
};

const ROLE_STARTERS: Record<ChatbotRoleId, string[]> = {
  tampi: [
    'হ্যালো Tampi, আজকের সন্ধ্যার জন্য একটা প্রোডাক্টিভ শিডিউল সাজিয়ে দাও।',
    'সহজ বাংলায় কোয়ান্টাম টানেলিং ব্যাপারটা বুঝিয়ে বলো।',
    'উইকেন্ডের জন্য একটা দারুণ ক্রিয়েটিভ সাইড প্রজেক্ট আইডিয়া দাও।',
  ],
  tutor: [
    'রিকারশন (Recursion) সহজ উদাহরণ আর ছোট একটা কুইজ দিয়ে শেখাও।',
    'Bayes theorem ধাপে ধাপে সহজ বাংলায় বুঝিয়ে দাও।',
    'HTTP/2 আর WebSockets-এর মধ্যে মূল পার্থক্য কী?',
  ],
  architect: [
    'Review the trade-offs between optimistic UI updates and server confirmation.',
    'Design a clean TypeScript rate limiter using token buckets.',
    'Debug why a WebSocket reconnect loop might leak event listeners.',
  ],
  analyst: [
    'Local-first storage বনাম cloud sync — সুবিধা ও অসুবিধা বিশ্লেষণ করো।',
    'Break down how to evaluate two competing project roadmaps from first principles.',
    'Stress-test my assumption that microservices will speed up our team.',
  ],
  custom: [
    'আমার কাস্টম ইন্সট্রাকশন অনুযায়ী তোমার ভূমিকা পরিচয় দাও।',
    'Summarize how you will approach my questions in this thread.',
    'চলুন একসাথে একটি স্ট্রাকচার্ড টাস্ক শুরু করি।',
  ],
};

const ROLE_STARTERS_EN: Record<ChatbotRoleId, string[]> = {
  tampi: [
    'Hey Tampi, plan out a productive evening schedule for me.',
    'Explain quantum tunneling in simple terms.',
    'Help me brainstorm a creative weekend side project.',
  ],
  tutor: [
    'Teach me recursion with a real-world analogy and a quick quiz.',
    'Walk me through Bayes theorem step by step.',
    'Explain how HTTP/2 differs from WebSockets.',
  ],
  architect: [
    'Review the trade-offs between optimistic UI updates and server confirmation.',
    'Design a clean TypeScript rate limiter using token buckets.',
    'Debug why a WebSocket reconnect loop might leak event listeners.',
  ],
  analyst: [
    'Analyze the pros and cons of local-first storage vs cloud sync.',
    'Break down how to evaluate two competing project roadmaps from first principles.',
    'Stress-test my assumption that microservices will speed up our team.',
  ],
  custom: [
    'Follow my custom system instruction and introduce your role.',
    'Summarize how you will approach my questions in this thread.',
    'Let us start working on a structured task together.',
  ],
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  open,
  messages,
  roleId,
  customSystemInstruction,
  taskMode,
  language = 'bn-BD',
  tampiPersona,
  isStreaming,
  errorMessage,
  userFirstName,
  onClose,
  onChangeRole,
  onChangeCustomInstruction,
  onChangeTaskMode,
  onSendMessage,
  onStopStreaming,
  onClearThread,
}) => {
  const [draft, setDraft] = useState('');
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages.length, isStreaming]);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  if (!open) return null;

  const activePreset =
    CHATBOT_ROLE_PRESETS.find((r) => r.id === roleId) ?? CHATBOT_ROLE_PRESETS[0];

  const effectiveInstruction =
    roleId === 'custom'
      ? customSystemInstruction
      : roleId === 'tampi'
        ? tampiPersona
        : activePreset.systemInstruction;

  const activeModeMeta =
    MODE_OPTIONS.find((m) => m.id === taskMode) ?? MODE_OPTIONS[0];

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = draft.trim();
    if (!clean || isStreaming) return;
    onSendMessage(clean);
    setDraft('');
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const starterMap = language === 'en-US' ? ROLE_STARTERS_EN : ROLE_STARTERS;
  const starters = starterMap[roleId] ?? starterMap.tampi;

  return (
    <aside
      aria-label="Gemini Multi-Turn Chatbot"
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[520px] flex-col bg-[#0b101b]/97 border-l border-white/10 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-cyan-400 shrink-0" />
            <h2 className="font-display text-lg font-semibold text-white truncate">
              Gemini Multi-Turn Chat
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-400 truncate">
            {activePreset.label} · {activeModeMeta.hint}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowRoleEditor((v) => !v)}
            aria-label="Configure role and system instruction"
            title="Role & System Instruction"
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              showRoleEditor
                ? 'bg-cyan-500/18 border-cyan-400/45 text-cyan-100'
                : 'bg-white/[0.04] border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Role</span>
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={onClearThread}
              disabled={isStreaming}
              aria-label="Clear conversation thread"
              title="Clear thread"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat panel"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Role & Task Routing Controls */}
      <div className="border-b border-white/10 px-5 py-3 space-y-2.5">
        {/* Role Presets */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
          {CHATBOT_ROLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChangeRole(preset.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                roleId === preset.id
                  ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/40'
                  : 'bg-white/[0.04] text-slate-400 border border-white/8 hover:text-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Task Complexity / Model Mode Switcher */}
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] border border-white/10 p-1">
          {MODE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              title={opt.hint}
              onClick={() => onChangeTaskMode(opt.id)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                taskMode === opt.id
                  ? 'bg-white/14 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Expandable System Instruction Drawer */}
        {showRoleEditor && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">
                System Instruction ({activePreset.label})
              </span>
              {roleId !== 'custom' ? (
                <button
                  type="button"
                  onClick={() => {
                    onChangeCustomInstruction(effectiveInstruction);
                    onChangeRole('custom');
                  }}
                  className="text-cyan-300 hover:text-cyan-200 transition-colors"
                >
                  Customize as New Role
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onChangeCustomInstruction(
                      CHATBOT_ROLE_PRESETS.find((r) => r.id === 'custom')
                        ?.systemInstruction ?? '',
                    )
                  }
                  className="flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
            <textarea
              rows={3}
              readOnly={roleId !== 'custom'}
              value={effectiveInstruction}
              onChange={(e) => {
                if (roleId === 'custom') {
                  onChangeCustomInstruction(e.target.value);
                }
              }}
              placeholder="Define the chatbot role, tone, and rules..."
              className={`custom-scrollbar w-full rounded-xl bg-[#070b14] border border-white/12 p-2.5 text-xs leading-relaxed focus:outline-none ${
                roleId === 'custom'
                  ? 'text-slate-200 focus:border-cyan-400/50'
                  : 'text-slate-400 cursor-default'
              }`}
            />
          </div>
        )}
      </div>

      {/* Scrollable Conversation Thread */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center py-6 space-y-5">
            <div className="space-y-1.5">
              <h3 className="font-display text-base font-semibold text-white">
                Start a multi-turn thread
              </h3>
              <p className="text-xs leading-relaxed text-slate-400">
                {activePreset.description}. Conversation context stays intact across turns so you can iterate, ask follow-ups, or switch reasoning depth anytime.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400">
                Suggested prompts
              </p>
              <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
                {starters.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => onSendMessage(prompt)}
                    className="w-full py-3 text-left text-xs leading-relaxed text-slate-200 hover:text-cyan-200 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isLastModelStreaming =
              isStreaming &&
              msg.role === 'model' &&
              idx === messages.length - 1;

            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1.5 ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-medium text-slate-400">
                    {msg.role === 'user'
                      ? userFirstName || 'You'
                      : activePreset.label}
                  </span>
                  {msg.role === 'model' && msg.modeUsed && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{MODE_LABELS[msg.modeUsed]}</span>
                    </>
                  )}
                  {msg.role === 'model' && msg.modelUsed && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        {msg.modelUsed}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>

                <div
                  className={`group relative max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    msg.role === 'user'
                      ? 'bg-cyan-500/16 text-cyan-50 border border-cyan-400/25'
                      : 'bg-white/[0.04] text-slate-100 border border-white/10'
                  }`}
                >
                  {msg.text || (isLastModelStreaming ? 'Thinking...' : '')}
                  {isLastModelStreaming && msg.text && (
                    <span
                      aria-hidden="true"
                      className="ml-1 inline-block h-3.5 w-1.5 align-middle bg-cyan-300 animate-pulse"
                    />
                  )}
                  {msg.role === 'model' &&
                    msg.sources &&
                    msg.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                        {msg.sources.map((src) => (
                          <a
                            key={src.uri}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-[220px] items-center gap-1 rounded-md bg-white/[0.05] border border-white/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/15 hover:border-cyan-400/35 transition-colors"
                          >
                            <span className="truncate">{src.title}</span>
                            <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-75" />
                          </a>
                        ))}
                      </div>
                    )}
                </div>

                {msg.role === 'model' && msg.text && !isLastModelStreaming && (
                  <button
                    type="button"
                    onClick={() => void handleCopy(msg.id, msg.text)}
                    className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-200 transition-colors"
                  >
                    {copiedId === msg.id ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })
        )}

        {errorMessage && (
          <div className="rounded-xl bg-rose-500/12 border border-rose-400/35 px-3.5 py-2.5 text-xs text-rose-200">
            {errorMessage}
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Multi-turn Composer */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-white/10 px-5 py-3.5 space-y-2"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={`Message ${activePreset.label}... (Enter to send, Shift+Enter for newline)`}
            className="custom-scrollbar max-h-32 min-h-[44px] flex-1 resize-none rounded-xl bg-white/[0.04] border border-white/12 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/55 focus:outline-none transition-colors"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStopStreaming}
              aria-label="Stop response"
              className="flex h-11 items-center gap-1.5 rounded-xl bg-amber-500/20 border border-amber-400/45 px-4 text-xs font-semibold text-amber-200 hover:bg-amber-500/30 transition-colors whitespace-nowrap shrink-0"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send message"
              className="flex h-11 items-center gap-1.5 rounded-xl bg-cyan-500 px-4 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          )}
        </div>
      </form>
    </aside>
  );
};
