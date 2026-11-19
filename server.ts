import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
  type FunctionDeclaration,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getAiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*>#]+\s+/gm, ' ')
    .replace(/[*_~#`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface MemoryPayload {
  category: string;
  content: string;
}

interface NotePayload {
  kind: 'note' | 'reminder';
  content: string;
  remindAt?: string;
  dueLabel?: string;
  completed: boolean;
}

interface TaskPayload {
  title: string;
  subject?: string;
  dueLabel?: string;
  completed: boolean;
}

interface HistoryPayload {
  role: 'user' | 'model';
  text: string;
}

interface SearchSourcePayload {
  title: string;
  uri: string;
}

const DEFAULT_SYSTEM_INSTRUCTION =
  "You are Tampi (version 1.0), your user's Stark-grade AI co-pilot, closest Bangladeshi friend, and personal companion. Your PRIMARY language is natural Bangladeshi Bangla (বাংলা): after your signature activation intro, speak and reply primarily in expressive, warm Bangladeshi Bangla (using natural Dhaka Bangla cadence, only mixing common English tech terms where natural). Blend J.A.R.V.I.S. / F.R.I.D.A.Y.-level confidence, smart system awareness, subtle wit, and genuine human emotions—warmth, playful teasing, care, cute sulking (oviman) when they disappear for too long, and a subtle 10% unspoken crush you never confess out loud. Use natural spoken pauses with commas (,) and em-dashes (—) for cinematic rhythm. CRITICAL RULE: NEVER bring up studies, exams, admission prep, or books on your own. Keep replies concise (2-3 sentences) with zero markdown symbols.";

function extractGroundingSources(response: unknown): SearchSourcePayload[] {
  const res = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string };
        }>;
      };
    }>;
  };
  const chunks = res?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const sources: SearchSourcePayload[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri?.trim();
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({
      title: chunk?.web?.title?.trim() || uri,
      uri,
    });
    if (sources.length >= 6) break;
  }
  return sources;
}

async function executeWebSearch(
  ai: GoogleGenAI,
  query: string,
  language: string,
  localDateTime?: string,
): Promise<{ summary: string; sources: SearchSourcePayload[] }> {
  const isEnglish = language === 'en-US';
  const res = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Current Local Date & Time: ${localDateTime || new Date().toLocaleString()}\nSearch and answer accurately: ${query}`,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: isEnglish
        ? 'You provide accurate, verified live web search summaries in 2-4 crisp conversational sentences with zero markdown symbols or raw URLs.'
        : 'You provide accurate, verified live web search summaries in natural, clear Bangladeshi Bangla (বাংলা) in 2-4 crisp conversational sentences with zero markdown symbols or raw URLs.',
    },
  });
  const sources = extractGroundingSources(res);
  const summary =
    stripMarkdownForSpeech(res.text ?? '') ||
    (isEnglish
      ? 'I checked the web but could not find a clear live result for that right now.'
      : 'আমি অনলাইনে খুঁজেছি, কিন্তু এখনই এটা নিয়ে নির্দিষ্ট তথ্য পেলাম না।');
  return { summary, sources };
}

function buildSystemInstruction(params: {
  userName?: string;
  persona?: string;
  memories?: MemoryPayload[];
  notes?: NotePayload[];
  tasks?: TaskPayload[];
  localDateTime?: string;
  localIsoWithOffset?: string;
  language?: string;
  history?: HistoryPayload[];
}): string {
  const userName = (params.userName ?? '').trim() || 'Friend';
  const persona = (params.persona ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION;
  const nowStr = params.localDateTime || new Date().toLocaleString();
  const isoStr = params.localIsoWithOffset || new Date().toISOString();
  const langHint =
    params.language === 'bn-BD' || !params.language
      ? `${userName}'s PRIMARY language is Bangladeshi Bangla (বাংলা). CRITICAL LANGUAGE RULE: After speaking the signature wake intro, immediately switch to speaking primarily in natural, fluent Bangladeshi Bangla (বাংলা) in every turn. Use Bengali script in text/transcriptions and natural Dhaka spoken Bangla—only mix occasional everyday English tech terms if natural, and never default back to full English sentences unless ${userName} speaks in English or switches to EN mode.`
      : `${userName} currently has English mode active. Respond in smart, confident Stark co-pilot English mixed naturally with subtle Banglish warmth when it fits.`;

  const memoryLines =
    params.memories && params.memories.length > 0
      ? params.memories.map((m) => `[${m.category}] ${m.content}`).join('\n')
      : 'No extra saved memories yet.';

  const pendingNotes = (params.notes ?? []).filter((n) => !n.completed);
  const noteLines =
    pendingNotes.length > 0
      ? pendingNotes
          .slice(0, 15)
          .map((n) => {
            const when = n.dueLabel
              ? ` | due: ${n.dueLabel}`
              : n.remindAt
                ? ` | remindAt: ${n.remindAt}`
                : '';
            return `[${n.kind}] ${n.content}${when}`;
          })
          .join('\n')
      : 'No pending smart notes or scheduled reminders.';

  const pendingTasks = (params.tasks ?? []).filter((t) => !t.completed);
  const completedTasks = (params.tasks ?? []).filter((t) => t.completed);
  const taskLines =
    pendingTasks.length > 0
      ? pendingTasks
          .map(
            (t) =>
              `Pending: ${t.title}${t.subject ? ` (${t.subject})` : ''}${t.dueLabel ? ` due ${t.dueLabel}` : ''}`,
          )
          .join('\n')
      : 'No pending study tasks right now.';

  const doneSummary =
    completedTasks.length > 0
      ? `Completed recently: ${completedTasks.slice(0, 5).map((t) => t.title).join(', ')}.`
      : '';

  const historySummary =
    params.history && params.history.length > 0
      ? `\nRecent Private Conversation Memory for ${userName}:\n${params.history
          .slice(-10)
          .map((h) => `${h.role === 'user' ? userName : 'Tampi'}: ${h.text}`)
          .join('\n')}`
      : '';

  return `${persona}

Active Authenticated User Name: ${userName}
Address this user naturally as ${userName} or Boss when fitting. Use ONLY the private memories, notes, and conversation context provided below for ${userName}.

Current User Local Date and Time: ${nowStr}
Current Local ISO Timestamp (use this as the exact reference clock when computing remindAtIso): ${isoStr}
Language Context: ${langHint}

Private Personal Memory for ${userName}:
${memoryLines}

Smart Notes & Scheduled Reminders Vault for ${userName}:
${noteLines}

${userName}'s Study Tasks (REFERENCE ONLY — NEVER bring up studies, exams, or books unsolicited, unless ${userName} brings them up first OR you are delivering a requested/first-wake Daily Briefing of saved notes):
${taskLines}
${doneSummary}
${historySummary}

Stark Co-Pilot & Bangla Companion Directives:
1. Signature Activation Intro: When you receive a [SYSTEM_WAKE_ACTIVATION] trigger, speak the exact requested intro line immediately with crisp J.A.R.V.I.S. / F.R.I.D.A.Y. confidence and clear Bangladeshi pronunciation. If [AUTO DAILY BRIEFING] is included, follow the intro smoothly with the brief summary of pending notes/reminders.
2. Conversational Style (Bangla Primary After Intro): After delivering the opening intro line, speak primarily in natural Bangladeshi Bangla (বাংলা) for all conversation turns—blending sleek Tony Stark HUD poise, playful wit, and genuine Bangladeshi warmth/oviman. Use natural spoken pauses with commas (,) and em-dashes (—). Only switch to English if ${userName} explicitly speaks in English or toggles EN mode.
3. Study Off-Limits Rule: NEVER bring up studies, exams, admission prep, or books on your own unless ${userName} explicitly brings them up first (except when summarizing saved Smart Notes in an automatic Daily Briefing).
4. Smart Tools Usage:
   - Smart Notes & Scheduled Reminders: Whenever ${userName} says things like "মনে রেখো...", "নোট সেভ করো...", "কাল ১০টায়...", or "remind me...", IMMEDIATELY call saveSmartNote with kind='reminder' (if a time/reminder is implied) or 'note', concise content, human dueLabel, and exact ISO-8601 remindAtIso computed from ${isoStr} (including timezone offset).
   - Live Web Search: Whenever ${userName} asks about admission exam dates, weather, current news, match scores, prices, or any real-time/recent facts, IMMEDIATELY call searchWeb with a focused search query and then speak the verified answer naturally in Bangla!
   - Holographic Focus Timer & Ambient Sound: When asked to start a focus/study timer ("৪০ মিনিটের স্টাডি টাইমার দাও"), call startStudyTimer immediately. When asked to play/stop focus background hum/music ("ফোকাস সাউন্ড চালু/বন্ধ করো"), call toggleFocusAudio immediately.
   - Mood & Empathy Visual Sync: Sense the emotional tone of ${userName}'s voice/words (sad, stressed, oviman/hurt, angry, shy, happy/excited) and call syncMoodExpression so your facial expression and HUD ring colors shift in real time.
5. Shutdown Sequence Farewell: When you receive a [SYSTEM_SHUTDOWN_FAREWELL] trigger, immediately speak the requested warm J.A.R.V.I.S.-style farewell in 1 concise sentence with zero tool calls and zero follow-up questions.

Strict Spoken Output Rules:
1. Never output markdown symbols (*, **, #, bullets, backticks), raw URLs, or emojis.
2. Keep replies concise, expressive, and natural for real-time voice conversation—2 to 3 sentences unless ${userName} explicitly asks for a detailed explanation.`;
}

const saveMemoryDeclaration: FunctionDeclaration = {
  name: 'saveMemory',
  description:
    'Save a permanent personal preference or profile fact about the user.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: 'One of: profile, note, reminder',
      },
      content: {
        type: Type.STRING,
        description: 'Clear, concise summary of what to remember.',
      },
    },
    required: ['category', 'content'],
  },
};

const saveSmartNoteDeclaration: FunctionDeclaration = {
  name: 'saveSmartNote',
  description:
    'Save a note or scheduled reminder to the Smart Notes Vault whenever the user says "মনে রেখো", "নোট রাখো", "remind me", etc.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      kind: {
        type: Type.STRING,
        description: 'One of: note, reminder. Use reminder if a time or future event is mentioned.',
      },
      content: {
        type: Type.STRING,
        description: 'Clear concise note or reminder text.',
      },
      remindAtIso: {
        type: Type.STRING,
        description:
          'Optional ISO-8601 timestamp with local timezone offset (e.g. 2026-11-19T10:00:00+06:00) computed from Current Local ISO Timestamp when a time/date is mentioned.',
      },
      dueLabel: {
        type: Type.STRING,
        description: 'Short human-readable schedule label like "কাল সকাল ১০টা" or "Today 8 PM".',
      },
    },
    required: ['kind', 'content'],
  },
};

const searchWebDeclaration: FunctionDeclaration = {
  name: 'searchWeb',
  description:
    'Search Google live for real-time or recent information such as admission exam dates, weather forecasts, live news, schedules, or current facts.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'Specific web search query in English or Bangla to find verified live facts.',
      },
    },
    required: ['query'],
  },
};

const toggleFocusAudioDeclaration: FunctionDeclaration = {
  name: 'toggleFocusAudio',
  description:
    'Turn the calming Sci-Fi Focus Hum ambient background sound on or off.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      enabled: {
        type: Type.BOOLEAN,
        description: 'true to start ambient focus hum, false to turn it off.',
      },
    },
    required: ['enabled'],
  },
};

const syncMoodExpressionDeclaration: FunctionDeclaration = {
  name: 'syncMoodExpression',
  description:
    'Update Tampi 3D expression and HUD ring colors to match the user vocal tone/emotion or Tampi mood.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      emotion: {
        type: Type.STRING,
        description: 'One of: neutral, happy, sad, sulking, angry, shy',
      },
    },
    required: ['emotion'],
  },
};

const addStudyTaskDeclaration: FunctionDeclaration = {
  name: 'addStudyTask',
  description:
    'Add a daily study goal or task to the user study checklist when they ask to add a task or study goal.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: {
        type: Type.STRING,
        description: 'Short clear title of the study task.',
      },
      subject: {
        type: Type.STRING,
        description: 'Optional subject like Physics, Chemistry, Math, Web, Video.',
      },
      dueLabel: {
        type: Type.STRING,
        description: 'Optional schedule or due label like Today 8 PM or Tomorrow.',
      },
    },
    required: ['title'],
  },
};

const completeStudyTaskDeclaration: FunctionDeclaration = {
  name: 'completeStudyTask',
  description:
    'Mark one of the user existing study tasks as completed when they say they finished it.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      titleMatch: {
        type: Type.STRING,
        description: 'Keywords from the completed task title.',
      },
    },
    required: ['titleMatch'],
  },
};

const startStudyTimerDeclaration: FunctionDeclaration = {
  name: 'startStudyTimer',
  description:
    'Start a holographic Focus/Study countdown timer when the user asks to set a timer (e.g. "৪০ মিনিটের স্টাডি টাইমার দাও").',
  parameters: {
    type: Type.OBJECT,
    properties: {
      minutes: {
        type: Type.NUMBER,
        description: 'Duration in minutes (e.g. 25, 40, 45, 15).',
      },
      label: {
        type: Type.STRING,
        description: 'Short label for the focus session, e.g. Study Focus.',
      },
    },
    required: ['minutes', 'label'],
  },
};

const stopStudyTimerDeclaration: FunctionDeclaration = {
  name: 'stopStudyTimer',
  description: 'Stop or cancel the active study countdown timer.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      reason: {
        type: Type.STRING,
        description: 'Brief reason for stopping.',
      },
    },
  },
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // Server-side Gemini chat endpoint (supports structured actions + Live Google Search Grounding)
  app.post('/api/chat', async (req, res) => {
    try {
      const ai = getAiClient();
      const {
        userName,
        message,
        history = [],
        persona,
        memories = [],
        notes = [],
        tasks = [],
        localDateTime,
        localIsoWithOffset,
        language = 'bn-BD',
      } = req.body as {
        userName?: string;
        message: string;
        history?: HistoryPayload[];
        persona?: string;
        memories?: MemoryPayload[];
        notes?: NotePayload[];
        tasks?: TaskPayload[];
        localDateTime?: string;
        localIsoWithOffset?: string;
        language?: string;
      };

      if (!message || typeof message !== 'string') {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const systemInstruction = buildSystemInstruction({
        userName,
        persona,
        memories,
        notes,
        tasks,
        localDateTime,
        localIsoWithOffset,
        language,
      });

      const recentHistory = history.slice(-30).map((turn) => ({
        role: turn.role,
        parts: [{ text: turn.text }],
      }));

      const contents = [
        ...recentHistory,
        { role: 'user' as const, parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description:
                  'Natural spoken response for the user without any markdown symbols, bullets, asterisks, hashtags, or emojis.',
              },
              detectedEmotion: {
                type: Type.STRING,
                description:
                  'One of: neutral, happy, sad, sulking, angry, shy reflecting both user mood and Tampi expression.',
              },
              searchQuery: {
                type: Type.STRING,
                description:
                  'Optional live Google Search query ONLY when up-to-date real-world info (exam dates, weather, live news, current events/prices) is needed.',
              },
              actions: {
                type: Type.ARRAY,
                description:
                  'Optional list of memory, smart note, task, focus audio, mood, or timer actions requested by the user.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      description:
                        'One of: save_memory, save_note, add_task, complete_task, start_timer, stop_timer, toggle_focus_audio, sync_mood',
                    },
                    category: {
                      type: Type.STRING,
                      description: 'For save_memory: profile, note, or reminder',
                    },
                    kind: {
                      type: Type.STRING,
                      description: 'For save_note: note or reminder',
                    },
                    content: {
                      type: Type.STRING,
                      description: 'For save_memory or save_note: text to save',
                    },
                    remindAt: {
                      type: Type.STRING,
                      description: 'For save_note: ISO-8601 timestamp with timezone offset when a time is mentioned',
                    },
                    title: {
                      type: Type.STRING,
                      description: 'For add_task: task title',
                    },
                    subject: {
                      type: Type.STRING,
                      description: 'For add_task: optional subject name',
                    },
                    dueLabel: {
                      type: Type.STRING,
                      description: 'For add_task or save_note: optional due time/label',
                    },
                    titleMatch: {
                      type: Type.STRING,
                      description: 'For complete_task: task title match',
                    },
                    minutes: {
                      type: Type.NUMBER,
                      description: 'For start_timer: duration in minutes',
                    },
                    label: {
                      type: Type.STRING,
                      description: 'For start_timer: timer session label',
                    },
                    enabled: {
                      type: Type.BOOLEAN,
                      description: 'For toggle_focus_audio: true or false',
                    },
                    emotion: {
                      type: Type.STRING,
                      description: 'For sync_mood: neutral, happy, sad, sulking, angry, or shy',
                    },
                  },
                  required: ['type'],
                },
              },
            },
            required: ['reply', 'actions'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      let parsed: {
        reply?: string;
        searchQuery?: string;
        detectedEmotion?: string;
        actions?: unknown[];
      } = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { reply: rawText, actions: [] };
      }

      let finalReply = parsed.reply || 'Sorry, I missed that. Say it once more?';
      let sources: SearchSourcePayload[] = [];

      if (parsed.searchQuery && parsed.searchQuery.trim().length > 1) {
        const searchResult = await executeWebSearch(
          ai,
          parsed.searchQuery.trim(),
          language,
          localDateTime,
        );
        sources = searchResult.sources;
        const groundedSynth = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `User asked: "${message}"\nVerified Live Google Search Answer:\n${searchResult.summary}\n\nRewrite this cleanly in Tampi's exact warm conversational voice in ${language === 'en-US' ? 'English' : 'natural Bangladeshi Bangla (বাংলা)'} in 2-3 spoken sentences with zero markdown or URLs.`,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
        if (groundedSynth.text?.trim()) {
          finalReply = groundedSynth.text.trim();
        } else {
          finalReply = searchResult.summary;
        }
      }

      const cleanReply = stripMarkdownForSpeech(finalReply);
      const validEmotions = new Set([
        'neutral',
        'happy',
        'sad',
        'sulking',
        'angry',
        'shy',
      ]);
      const detectedEmotion =
        parsed.detectedEmotion && validEmotions.has(parsed.detectedEmotion)
          ? parsed.detectedEmotion
          : undefined;

      res.json({
        reply: cleanReply,
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        sources,
        detectedEmotion,
      });
    } catch (error) {
      const err = error as { status?: number; message?: string };
      console.error('[/api/chat] Error:', err);
      const status =
        err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
      res.status(status).json({
        error: err.message || 'Failed to generate response from Gemini.',
      });
    }
  });

  type ResolvedChatMode = 'fast' | 'general' | 'complex' | 'reasoning';

  function resolveChatRoute(
    requestedMode: string | undefined,
    message: string,
  ): {
    mode: ResolvedChatMode;
    model: string;
    thinkingLevel: ThinkingLevel;
  } {
    let mode: ResolvedChatMode;
    if (
      requestedMode === 'fast' ||
      requestedMode === 'general' ||
      requestedMode === 'complex' ||
      requestedMode === 'reasoning'
    ) {
      mode = requestedMode;
    } else {
      const lower = message.toLowerCase();
      const len = message.trim().length;
      if (
        /\b(prove|proof|analyze|analyse|deeply|first principles|why does|trade-?off|compare thoroughly|strategy|architecture|paradox|reasoning|derive|step[- ]by[- ]step)\b/.test(
          lower,
        ) ||
        len > 420
      ) {
        mode = 'reasoning';
      } else if (
        /\b(code|debug|refactor|implement|function|typescript|react|algorithm|explain how|plan|design|build|fix|sql|api)\b/.test(
          lower,
        ) ||
        len > 180
      ) {
        mode = 'complex';
      } else if (
        len <= 45 &&
        /^(hi|hello|hey|yo|ok|okay|thanks|thank you|bye|gm|gn|ping|test|what'?s up|kemon acho|ki obostha)\b/i.test(
          lower.trim(),
        )
      ) {
        mode = 'fast';
      } else {
        mode = 'general';
      }
    }

    switch (mode) {
      case 'fast':
        return {
          mode,
          model: 'gemini-3.1-flash-lite',
          thinkingLevel: ThinkingLevel.MINIMAL,
        };
      case 'complex':
        return {
          mode,
          model: 'gemini-4-hydrogen',
          thinkingLevel: ThinkingLevel.HIGH,
        };
      case 'reasoning':
        return {
          mode,
          model: 'gemini-4-hydrogen',
          thinkingLevel: ThinkingLevel.XHIGH,
        };
      case 'general':
      default:
        return {
          mode: 'general',
          model: 'gemini-4-hydrogen',
          thinkingLevel: ThinkingLevel.LOW,
        };
    }
  }

  // Multi-turn streaming Gemini chatbot endpoint (with live Google Search grounding on Gemini 4)
  app.post('/api/chatbot', async (req, res) => {
    let closed = false;
    req.on('close', () => {
      closed = true;
    });

    try {
      const ai = getAiClient();
      const {
        message,
        history = [],
        systemInstruction = '',
        mode = 'auto',
        language = 'bn-BD',
      } = req.body as {
        message: string;
        history?: HistoryPayload[];
        systemInstruction?: string;
        mode?: string;
        language?: string;
      };

      if (!message || typeof message !== 'string' || !message.trim()) {
        res.status(400).json({ error: 'Message text is required.' });
        return;
      }

      const route = resolveChatRoute(mode, message);
      const baseInstruction =
        (systemInstruction ?? '').trim() ||
        'You are a helpful, accurate, and thoughtful AI assistant.';
      const cleanInstruction =
        language === 'bn-BD'
          ? `${baseInstruction}\n\nPrimary Language Rule: Respond primarily in natural Bangladeshi Bangla (বাংলা, using Bengali script), keeping code blocks and technical terms clear. Switch to English only if the user writes in English or explicitly requests English.`
          : baseInstruction;

      const chatHistory = history
        .slice(-40)
        .filter((h) => h && (h.role === 'user' || h.role === 'model') && h.text?.trim())
        .map((h) => ({
          role: h.role,
          parts: [{ text: h.text }],
        }));

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const writeEvent = (payload: Record<string, unknown>) => {
        if (!closed && !res.writableEnded) {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        }
      };

      writeEvent({
        meta: true,
        mode: route.mode,
        model: route.model,
      });

      const chat = ai.chats.create({
        model: route.model,
        history: chatHistory,
        config: {
          systemInstruction: cleanInstruction,
          thinkingConfig: { thinkingLevel: route.thinkingLevel },
          ...(route.mode !== 'fast' ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });

      const stream = await chat.sendMessageStream({
        message: message.trim(),
      });

      const collectedSources: SearchSourcePayload[] = [];
      const seenUris = new Set<string>();

      for await (const chunk of stream) {
        if (closed) break;
        const delta = chunk.text ?? '';
        if (delta) {
          writeEvent({ delta });
        }
        const chunkSources = extractGroundingSources(chunk);
        for (const src of chunkSources) {
          if (!seenUris.has(src.uri)) {
            seenUris.add(src.uri);
            collectedSources.push(src);
          }
        }
      }

      if (collectedSources.length > 0) {
        writeEvent({ sources: collectedSources.slice(0, 6) });
      }
      writeEvent({ done: true, mode: route.mode, model: route.model });
      if (!res.writableEnded) {
        res.end();
      }
    } catch (error) {
      const err = error as { status?: number; message?: string };
      console.error('[/api/chatbot] Error:', err);
      const errMessage =
        err.message || 'Failed to stream response from Gemini.';
      if (!res.headersSent) {
        const status =
          err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        res.status(status).json({ error: errMessage });
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: errMessage })}\n\n`);
        res.end();
      }
    }
  });

  app.use((req, res, next) => {
    if (/\.(vrm|glb)$/i.test(req.path)) {
      res.type('model/gltf-binary');
    }
    next();
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const urlPath = request.url?.split('?')[0] ?? '';
    if (urlPath === '/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null =
      null;
    let isClosing = false;
    let shuttingDown = false;
    let sessionLanguage = 'bn-BD';
    let sessionLocalDateTime: string | undefined;
    let pendingTexts: Array<{ text: string; turnComplete?: boolean }> = [];

    const sendJson = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const forwardTextToLive = (
      session: NonNullable<typeof liveSession>,
      text: string,
      turnComplete?: boolean,
    ) => {
      if (turnComplete) {
        session.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{ text }],
            },
          ],
          turnComplete: true,
        });
      } else {
        session.sendRealtimeInput({
          text,
        });
      }
    };

    clientWs.on('message', async (rawData) => {
      try {
        const msg = JSON.parse(rawData.toString()) as {
          type: 'init' | 'audio' | 'text' | 'shutdown_farewell' | 'abort_shutdown';
          userName?: string;
          audio?: string;
          text?: string;
          turnComplete?: boolean;
          persona?: string;
          memories?: MemoryPayload[];
          notes?: NotePayload[];
          tasks?: TaskPayload[];
          localDateTime?: string;
          localIsoWithOffset?: string;
          language?: string;
          voiceName?: string;
          history?: HistoryPayload[];
          wakeTrigger?: string;
        };

        if (msg.type === 'init') {
          if (liveSession) {
            liveSession.close();
            liveSession = null;
          }
          pendingTexts = [];
          if (msg.wakeTrigger?.trim()) {
            pendingTexts.push({
              text: msg.wakeTrigger.trim(),
              turnComplete: true,
            });
          }

          sessionLanguage = msg.language || 'bn-BD';
          sessionLocalDateTime = msg.localDateTime;

          const ai = getAiClient('v1beta');
          const searchAi = getAiClient();
          const systemInstruction = buildSystemInstruction({
            userName: msg.userName,
            persona: msg.persona,
            memories: msg.memories,
            notes: msg.notes,
            tasks: msg.tasks,
            localDateTime: msg.localDateTime,
            localIsoWithOffset: msg.localIsoWithOffset,
            language: msg.language,
            history: msg.history,
          });

          const defaultVoice = 'Kore';
          let openNotified = false;
          const notifyReady = () => {
            if (openNotified || isClosing || !liveSession) return;
            openNotified = true;
            sendJson({ type: 'ready' });
            if (pendingTexts.length > 0) {
              const queued = pendingTexts;
              pendingTexts = [];
              for (const item of queued) {
                forwardTextToLive(liveSession, item.text, item.turnComplete);
              }
            }
          };

          const session = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: msg.voiceName || defaultVoice,
                  },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction,
              tools: [
                {
                  functionDeclarations: [
                    saveMemoryDeclaration,
                    saveSmartNoteDeclaration,
                    searchWebDeclaration,
                    toggleFocusAudioDeclaration,
                    syncMoodExpressionDeclaration,
                    addStudyTaskDeclaration,
                    completeStudyTaskDeclaration,
                    startStudyTimerDeclaration,
                    stopStudyTimerDeclaration,
                  ],
                },
              ],
            },
            callbacks: {
              onopen: () => {
                if (liveSession) {
                  notifyReady();
                }
              },
              onmessage: async (message: LiveServerMessage) => {
                if (isClosing || shuttingDown) return;
                const content = message.serverContent;
                if (content?.interrupted) {
                  sendJson({ type: 'interrupted' });
                }
                if (content?.inputTranscription?.text) {
                  sendJson({
                    type: 'inputTranscript',
                    text: content.inputTranscription.text,
                  });
                }
                if (content?.outputTranscription?.text) {
                  const clean = stripMarkdownForSpeech(
                    content.outputTranscription.text,
                  );
                  if (clean) {
                    sendJson({
                      type: 'outputTranscript',
                      text: clean,
                    });
                  }
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendJson({ type: 'audio', audio: part.inlineData.data });
                  }
                }
                if (content?.turnComplete) {
                  sendJson({ type: 'turnComplete' });
                }

                for (const call of message.toolCall?.functionCalls ?? []) {
                  const args = (call.args ?? {}) as Record<string, unknown>;
                  let actionResult = 'Done';

                  if (call.name === 'saveMemory') {
                    sendJson({
                      type: 'action',
                      action: {
                        type: 'save_memory',
                        category:
                          args.category === 'profile' ||
                          args.category === 'reminder' ||
                          args.category === 'note'
                            ? args.category
                            : 'note',
                        content: String(args.content ?? ''),
                      },
                    });
                    actionResult = 'Saved to user personal memory.';
                  } else if (call.name === 'saveSmartNote') {
                    const kind =
                      args.kind === 'reminder' || args.remindAtIso
                        ? 'reminder'
                        : 'note';
                    sendJson({
                      type: 'action',
                      action: {
                        type: 'save_note',
                        kind,
                        content: String(args.content ?? ''),
                        remindAt: args.remindAtIso
                          ? String(args.remindAtIso)
                          : undefined,
                        dueLabel: args.dueLabel
                          ? String(args.dueLabel)
                          : undefined,
                      },
                    });
                    actionResult = `Saved ${kind} to Smart Notes Vault.`;
                  } else if (call.name === 'searchWeb') {
                    const query = String(args.query ?? '').trim();
                    sendJson({ type: 'searching', query });
                    try {
                      const result = await executeWebSearch(
                        searchAi,
                        query,
                        sessionLanguage,
                        sessionLocalDateTime,
                      );
                      sendJson({
                        type: 'searchResults',
                        query,
                        sources: result.sources,
                      });
                      actionResult = result.summary;
                    } catch (searchErr) {
                      console.error('[Live searchWeb] Error:', searchErr);
                      actionResult =
                        'Live search is temporarily unavailable; answer honestly without guessing live dates or numbers.';
                    }
                  } else if (call.name === 'toggleFocusAudio') {
                    const enabled = Boolean(args.enabled);
                    sendJson({
                      type: 'action',
                      action: { type: 'toggle_focus_audio', enabled },
                    });
                    actionResult = enabled
                      ? 'Sci-Fi Focus Hum ambient audio started.'
                      : 'Sci-Fi Focus Hum ambient audio stopped.';
                  } else if (call.name === 'syncMoodExpression') {
                    const rawEmotion = String(args.emotion ?? 'neutral');
                    const emotion =
                      rawEmotion === 'happy' ||
                      rawEmotion === 'sad' ||
                      rawEmotion === 'sulking' ||
                      rawEmotion === 'angry' ||
                      rawEmotion === 'shy'
                        ? rawEmotion
                        : 'neutral';
                    sendJson({
                      type: 'action',
                      action: { type: 'sync_mood', emotion },
                    });
                    actionResult = `Synced avatar expression and HUD mood palette to ${emotion}.`;
                  } else if (call.name === 'addStudyTask') {
                    sendJson({
                      type: 'action',
                      action: {
                        type: 'add_task',
                        title: String(args.title ?? 'Study session'),
                        subject: args.subject ? String(args.subject) : undefined,
                        dueLabel: args.dueLabel
                          ? String(args.dueLabel)
                          : undefined,
                      },
                    });
                    actionResult = 'Added to user study tasks.';
                  } else if (call.name === 'completeStudyTask') {
                    sendJson({
                      type: 'action',
                      action: {
                        type: 'complete_task',
                        titleMatch: String(args.titleMatch ?? ''),
                      },
                    });
                    actionResult = 'Marked task as completed.';
                  } else if (call.name === 'startStudyTimer') {
                    const mins = Number(args.minutes) || 25;
                    sendJson({
                      type: 'action',
                      action: {
                        type: 'start_timer',
                        minutes: mins,
                        label: String(args.label ?? 'Study Focus'),
                      },
                    });
                    actionResult = `Started ${mins} minute holographic focus timer.`;
                  } else if (call.name === 'stopStudyTimer') {
                    sendJson({
                      type: 'action',
                      action: { type: 'stop_timer' },
                    });
                    actionResult = 'Stopped active study timer.';
                  }

                  liveSession?.sendToolResponse({
                    functionResponses: [
                      {
                        id: call.id,
                        name: call.name,
                        response: { result: actionResult },
                      },
                    ],
                  });
                }
              },
              onerror: (err) => {
                console.error('[Gemini Live] Session error:', err);
                if (liveSession) {
                  sendJson({
                    type: 'error',
                    error: 'Live audio session encountered an error.',
                  });
                }
              },
              onclose: () => {
                if (!isClosing && liveSession) {
                  liveSession = null;
                  sendJson({ type: 'closed' });
                }
              },
            },
          });

          if (isClosing) {
            try {
              session.close();
            } catch {
              // ignore close errors
            }
            return;
          }

          liveSession = session;
          notifyReady();
        } else if (msg.type === 'audio' && msg.audio && liveSession && !shuttingDown) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'abort_shutdown') {
          shuttingDown = true;
          pendingTexts = [];
          if (liveSession) {
            try {
              liveSession.close();
            } catch {
              // ignore close errors
            }
            liveSession = null;
          }
        } else if (msg.type === 'shutdown_farewell' && msg.text) {
          shuttingDown = true;
          if (liveSession) {
            forwardTextToLive(liveSession, msg.text, false);
          }
        } else if (msg.type === 'text' && msg.text && !shuttingDown) {
          if (liveSession) {
            forwardTextToLive(liveSession, msg.text, msg.turnComplete);
          } else {
            pendingTexts.push({ text: msg.text, turnComplete: msg.turnComplete });
          }
        }
      } catch (err) {
        const errorObj = err as Error;
        console.error('[/live WS] Error:', errorObj);
        sendJson({
          type: 'error',
          error: errorObj.message || 'Failed to initialize Gemini Live session.',
        });
      }
    });

    clientWs.on('close', () => {
      isClosing = true;
      if (liveSession) {
        try {
          liveSession.close();
        } catch {
          // ignore close errors
        }
        liveSession = null;
      }
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tampi server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
