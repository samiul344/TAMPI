import React, { useState } from 'react';
import {
  Check,
  Clock,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  MemoryItem,
  StudySessionRecord,
  StudyTask,
} from '../types/tampi';

interface MemoryDrawerProps {
  open: boolean;
  memories: MemoryItem[];
  tasks: StudyTask[];
  sessions: StudySessionRecord[];
  historyCount: number;
  isSignedIn: boolean;
  onClose: () => void;
  onAddMemory: (category: MemoryItem['category'], content: string) => void;
  onDeleteMemory: (id: string) => void;
  onAddTask: (title: string, subject?: string, dueLabel?: string) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onClearHistory: () => void;
}

export const MemoryDrawer: React.FC<MemoryDrawerProps> = ({
  open,
  memories,
  tasks,
  sessions,
  historyCount,
  isSignedIn,
  onClose,
  onAddMemory,
  onDeleteMemory,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onClearHistory,
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'notes' | 'sessions'>(
    'tasks',
  );
  const [taskTitle, setTaskTitle] = useState('');
  const [taskSubject, setTaskSubject] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteCategory, setNoteCategory] =
    useState<MemoryItem['category']>('note');

  if (!open) return null;

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;
    onAddTask(title, taskSubject.trim() || undefined);
    setTaskTitle('');
    setTaskSubject('');
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    const content = noteContent.trim();
    if (!content) return;
    onAddMemory(noteCategory, content);
    setNoteContent('');
  };

  const totalMinutesLogged = sessions.reduce(
    (sum, s) => sum + s.durationMinutes,
    0,
  );

  return (
    <aside
      aria-label="Personal Memory and Study Tasks"
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[420px] flex-col bg-[#0b101b]/96 border-l border-white/10 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">
            Personal Memory & Notes
          </h2>
          <p className="text-xs text-slate-400">
            {isSignedIn
              ? 'Synced to your account and Tampi context'
              : 'Saved locally · Sign in to sync across devices'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close memory drawer"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="px-5 pt-4">
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] border border-white/10 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'tasks'
                ? 'bg-white/12 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tasks ({tasks.filter((t) => !t.completed).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'notes'
                ? 'bg-white/12 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Memory ({memories.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'sessions'
                ? 'bg-white/12 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Study Log ({sessions.length})
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-4">
        {activeTab === 'tasks' && (
          <div className="space-y-4">
            <form onSubmit={handleAddTask} className="space-y-2">
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Add a study goal or exam task..."
                className="h-10 w-full rounded-xl bg-white/[0.04] border border-white/10 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
              />
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={taskSubject}
                  onChange={(e) => setTaskSubject(e.target.value)}
                  placeholder="Subject (e.g. Physics, Math)"
                  className="h-9 flex-1 rounded-xl bg-white/[0.04] border border-white/10 px-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!taskTitle.trim()}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-cyan-500 px-3.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Task</span>
                </button>
              </div>
            </form>

            <div className="divide-y divide-white/[0.07]">
              {tasks.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  No study tasks yet. Ask Tampi to add one or type above.
                </p>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 py-3"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      aria-label={
                        task.completed ? 'Mark task incomplete' : 'Mark task done'
                      }
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        task.completed
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                          : 'border-white/25 hover:border-cyan-400'
                      }`}
                    >
                      {task.completed && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm leading-snug ${
                          task.completed
                            ? 'text-slate-500 line-through'
                            : 'text-slate-100'
                        }`}
                      >
                        {task.title}
                      </p>
                      {(task.subject || task.dueLabel) && (
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                          {task.subject && <span>{task.subject}</span>}
                          {task.subject && task.dueLabel && (
                            <span aria-hidden="true">·</span>
                          )}
                          {task.dueLabel && <span>{task.dueLabel}</span>}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      aria-label="Delete task"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/15 hover:text-rose-300 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4">
            <form onSubmit={handleAddNote} className="space-y-2">
              <textarea
                rows={2}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Save a personal fact, exam date, or reminder..."
                className="w-full rounded-xl bg-white/[0.04] border border-white/10 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] border border-white/10 p-1">
                  {(['note', 'reminder', 'profile'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNoteCategory(cat)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                        noteCategory === cat
                          ? 'bg-white/12 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={!noteContent.trim()}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-cyan-500 px-3.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Save</span>
                </button>
              </div>
            </form>

            <div className="divide-y divide-white/[0.07]">
              {memories.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Say &quot;Remember that...&quot; or add a note above.
                </p>
              ) : (
                memories.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[11px] font-medium text-cyan-400 capitalize">
                        <span>{item.category}</span>
                        <span className="text-slate-600" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-slate-200">
                        {item.content}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteMemory(item.id)}
                      aria-label="Delete memory"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/15 hover:text-rose-300 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-white/10 pb-3">
              <span className="text-xs text-slate-400">
                Completed Focus Sprints
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums text-amber-300">
                {totalMinutesLogged} mins total
              </span>
            </div>

            <div className="divide-y divide-white/[0.07]">
              {sessions.length === 0 ? (
                <p className="py-8 text-center text-xs leading-relaxed text-slate-500">
                  No completed study timers logged yet. Ask Tampi to &quot;Set a
                  25-minute study timer&quot; to log your first sprint.
                </p>
              ) : (
                sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-100">
                          {sess.label}
                        </p>
                        <p className="font-mono text-[11px] tabular-nums text-slate-500">
                          {new Date(sess.completedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <span className="font-mono text-xs font-medium tabular-nums text-amber-300 shrink-0">
                      {sess.durationMinutes}m
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/10 px-5 py-3.5 text-xs">
        <span className="font-mono tabular-nums text-slate-400">
          {Math.ceil(historyCount / 2)} / 15 turns in memory
        </span>
        <button
          type="button"
          onClick={onClearHistory}
          className="text-slate-400 hover:text-rose-300 transition-colors"
        >
          Clear Chat History
        </button>
      </div>
    </aside>
  );
};
