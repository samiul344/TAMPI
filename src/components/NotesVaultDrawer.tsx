import React, { useMemo, useState } from 'react';
import {
  Bell,
  CalendarClock,
  Check,
  Clock,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { SmartNote } from '../types/tampi';

interface NotesVaultDrawerProps {
  open: boolean;
  notes: SmartNote[];
  isSignedIn: boolean;
  onClose: () => void;
  onAddNote: (params: {
    kind: 'note' | 'reminder';
    content: string;
    remindAt?: string;
    dueLabel?: string;
  }) => void;
  onToggleComplete: (id: string) => void;
  onDeleteNote: (id: string) => void;
}

type FilterTab = 'all' | 'reminder' | 'note';

function formatScheduleBadge(note: SmartNote): string | null {
  if (note.dueLabel?.trim()) return note.dueLabel.trim();
  if (!note.remindAt) return null;
  const ms = Date.parse(note.remindAt);
  if (Number.isNaN(ms)) return note.remindAt;
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTimeStatus(note: SmartNote): 'completed' | 'reminded' | 'due' | 'upcoming' | null {
  if (note.completed) return 'completed';
  if (note.kind !== 'reminder' || !note.remindAt) return null;
  if (note.reminded) return 'reminded';
  const ms = Date.parse(note.remindAt);
  if (Number.isNaN(ms)) return null;
  return ms <= Date.now() ? 'due' : 'upcoming';
}

export const NotesVaultDrawer: React.FC<NotesVaultDrawerProps> = ({
  open,
  notes,
  isSignedIn,
  onClose,
  onAddNote,
  onToggleComplete,
  onDeleteNote,
}) => {
  const [tab, setTab] = useState<FilterTab>('all');
  const [kind, setKind] = useState<'note' | 'reminder'>('reminder');
  const [content, setContent] = useState('');
  const [remindLocal, setRemindLocal] = useState('');
  const [dueLabel, setDueLabel] = useState('');

  const pendingCount = useMemo(
    () => notes.filter((n) => !n.completed).length,
    [notes],
  );
  const reminderCount = useMemo(
    () => notes.filter((n) => n.kind === 'reminder' && !n.completed).length,
    [notes],
  );
  const noteCount = useMemo(
    () => notes.filter((n) => n.kind === 'note' && !n.completed).length,
    [notes],
  );

  const filteredNotes = useMemo(() => {
    const list =
      tab === 'all' ? notes : notes.filter((n) => n.kind === tab);
    return [...list].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.remindAt && b.remindAt) {
        return a.remindAt.localeCompare(b.remindAt);
      }
      if (a.remindAt && !b.remindAt) return -1;
      if (!a.remindAt && b.remindAt) return 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [notes, tab]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = content.trim();
    if (!clean) return;

    let remindAtIso: string | undefined;
    let computedDue = dueLabel.trim() || undefined;
    if (kind === 'reminder' && remindLocal.trim()) {
      const parsed = new Date(remindLocal);
      if (!Number.isNaN(parsed.getTime())) {
        remindAtIso = parsed.toISOString();
        if (!computedDue) {
          computedDue = parsed.toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        }
      }
    }

    onAddNote({
      kind,
      content: clean,
      remindAt: remindAtIso,
      dueLabel: computedDue,
    });
    setContent('');
    setRemindLocal('');
    setDueLabel('');
  };

  return (
    <aside
      aria-label="Smart Notes & Reminders Vault"
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[440px] flex-col bg-[#0b101b]/97 border-l border-white/10 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
        <div>
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-amber-300" />
            <h2 className="font-display text-lg font-semibold text-white">
              Smart Notes Vault
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            {isSignedIn
              ? 'Synced to Firestore • Proactive voice reminders enabled'
              : 'Local mode • Sign in to sync notes across devices'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Notes Vault"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 border-b border-white/10 px-6 py-3">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
            tab === 'all'
              ? 'bg-white/12 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          All ({pendingCount})
        </button>
        <button
          type="button"
          onClick={() => setTab('reminder')}
          className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
            tab === 'reminder'
              ? 'bg-white/12 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Reminders ({reminderCount})
        </button>
        <button
          type="button"
          onClick={() => setTab('note')}
          className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
            tab === 'note'
              ? 'bg-white/12 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Notes ({noteCount})
        </button>
      </div>

      {/* Quick Create Note / Scheduled Reminder */}
      <form
        onSubmit={handleSubmit}
        className="border-b border-white/10 px-6 py-4 space-y-2.5"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setKind('reminder')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
              kind === 'reminder'
                ? 'bg-amber-500/18 border-amber-400/45 text-amber-200'
                : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>Reminder</span>
          </button>
          <button
            type="button"
            onClick={() => setKind('note')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
              kind === 'note'
                ? 'bg-cyan-500/18 border-cyan-400/45 text-cyan-200'
                : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            <StickyNote className="h-3.5 w-3.5" />
            <span>Quick Note</span>
          </button>
        </div>

        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            kind === 'reminder'
              ? 'যেমন: কাল সকাল ১০টায় মডেল টেস্ট...'
              : 'নোট লিখে রাখো বা কথা বলে সেভ করো...'
          }
          className="h-10 w-full rounded-xl bg-white/[0.04] border border-white/12 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/55 focus:outline-none"
        />

        {kind === 'reminder' && (
          <div className="flex items-center gap-2">
            <label className="relative flex flex-1 items-center">
              <CalendarClock className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
              <input
                type="datetime-local"
                value={remindLocal}
                onChange={(e) => setRemindLocal(e.target.value)}
                aria-label="Reminder date and time"
                className="h-9 w-full rounded-lg bg-white/[0.04] border border-white/12 pl-8 pr-2.5 text-xs text-slate-200 focus:border-amber-400/55 focus:outline-none"
              />
            </label>
            <input
              type="text"
              value={dueLabel}
              onChange={(e) => setDueLabel(e.target.value)}
              placeholder="Label (e.g. কাল ১০টা)"
              className="h-9 w-36 rounded-lg bg-white/[0.04] border border-white/12 px-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-400/55 focus:outline-none"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={!content.trim()}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Save to Notes Vault</span>
        </button>
      </form>

      {/* Scrollable Notes & Reminders List */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
        {filteredNotes.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <p className="text-sm font-medium text-slate-300">
              No saved notes or reminders here yet.
            </p>
            <p className="text-xs leading-relaxed text-slate-500">
              Try telling Tampi: &ldquo;মনে রেখো, কাল সকাল ১০টায় মডেল টেস্ট&rdquo; — she will save it automatically and remind you proactively when time arrives.
            </p>
          </div>
        ) : (
          filteredNotes.map((note) => {
            const scheduleText = formatScheduleBadge(note);
            const status = getTimeStatus(note);

            return (
              <div
                key={note.id}
                className={`group flex items-start justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                  note.completed
                    ? 'bg-white/[0.02] border-white/6 opacity-60'
                    : status === 'due'
                      ? 'bg-amber-500/10 border-amber-400/40'
                      : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => onToggleComplete(note.id)}
                    aria-label={
                      note.completed ? 'Mark as pending' : 'Mark as done'
                    }
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      note.completed
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                        : 'border-white/25 hover:border-cyan-400'
                    }`}
                  >
                    {note.completed && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                  </button>

                  <div className="min-w-0">
                    <p
                      className={`text-sm leading-relaxed break-words ${
                        note.completed
                          ? 'line-through text-slate-400'
                          : 'text-slate-100'
                      }`}
                    >
                      {note.content}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        className={`font-medium uppercase tracking-wider ${
                          note.kind === 'reminder'
                            ? 'text-amber-300'
                            : 'text-cyan-300'
                        }`}
                      >
                        {note.kind}
                      </span>
                      {scheduleText && (
                        <>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-300 tabular-nums">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {scheduleText}
                          </span>
                        </>
                      )}
                      {status === 'reminded' && (
                        <>
                          <span className="text-slate-600" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-emerald-300">Reminded</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDeleteNote(note.id)}
                  aria-label="Delete note"
                  className="text-slate-500 hover:text-rose-300 transition-colors shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
