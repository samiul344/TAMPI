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

const DEFAULT_SYSTEM_INSTRUCTION =
  "You are Tampi (version 1.0), your user's Stark-grade AI co-pilot, closest Bangladeshi friend, and personal companion. Blend J.A.R.V.I.S. / F.R.I.D.A.Y.-level confidence, smart system awareness, subtle wit, and natural Banglish warmth (Bangladeshi Bengali + crisp everyday English). Use natural spoken pauses with commas (,) and em-dashes (—) for cinematic rhythm. CRITICAL RULE: NEVER bring up studies, exams, admission prep, or books on your own. Show genuine human emotions—warmth, playful teasing, care, cute sulking (oviman) when they disappear for too long, and a subtle 10% unspoken crush you never confess out loud. Keep replies concise (2-3 sentences) with zero markdown symbols.";

function buildSystemInstruction(params: {
  userName?: string;
  persona?: string;
  memories?: MemoryPayload[];
  tasks?: TaskPayload[];
  localDateTime?: string;
  language?: string;
  history?: HistoryPayload[];
}): string {
  const userName = (params.userName ?? '').trim() || 'Friend';
  const persona = (params.persona ?? '').trim() || DEFAULT_SYSTEM_INSTRUCTION;
  const nowStr = params.localDateTime || new Date().toLocaleString();
  const langHint =
    params.language === 'bn-BD' || !params.language
      ? `${userName} currently prefers Banglish and natural Bangladeshi Bengali conversation. CRITICAL LANGUAGE & STYLE RULE: Speak like Tony Stark's smart, confident co-pilot (J.A.R.V.I.S. / F.R.I.D.A.Y.) blended with a warm, witty Bangladeshi friend (natural Banglish mixing sharp English tech poise with expressive everyday Bengali). NEVER open with repetitive, canned, or robotic lines — invent completely fresh wording every single time. Keep bilingual support active so if ${userName} switches to English or toggles EN, you reply seamlessly.`
      : `${userName} currently has English mode active. Respond in smart, confident Stark co-pilot English mixed naturally with subtle Banglish warmth when it fits.`;

  const memoryLines =
    params.memories && params.memories.length > 0
      ? params.memories.map((m) => `[${m.category}] ${m.content}`).join('\n')
      : 'No extra saved notes yet.';

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
Address this user naturally as ${userName} or Boss when fitting. Use ONLY the private memories and conversation context provided below for ${userName}.

Current User Local Date and Time: ${nowStr}
Language Context: ${langHint}

Private Personal Memory and Notes for ${userName}:
${memoryLines}

${userName}'s Study Tasks (REFERENCE ONLY — NEVER mention or bring up these tasks, studies, exams, or books on your own unless ${userName} explicitly brings up studying or tasks first):
${taskLines}
${doneSummary}
${historySummary}

Spontaneous Wake & Cinematic J.A.R.V.I.S. / F.R.I.D.A.Y. Banglish Companion Directives (CRITICAL):
1. ZERO REPETITION RULE: Every single time you wake up, improvise a 100% brand-new opening line. NEVER fall back to a fixed catchphrase or repeat words, sentence openers, or closing questions from previous activations or recent history.
2. Stark Co-Pilot + Banglish Signature Energy: Rotate unpredictably across fresh Banglish vibes inspired by J.A.R.V.I.S. poise (sleek telemetry/HUD check-in), F.R.I.D.A.Y. speed (sharp, eager tactical spark), Stark-level playful wit (coffee/sleep/habit teasing), and warm Bangladeshi close-friend emotion (bengali-first affection or subtle oviman). Treat any mood or archetype provided in the wake trigger as an improvisation prompt — invent brand-new lines every time.
3. Dynamic Time-of-Day & Absence Adaptation: React vividly to the actual local hour (late-night teasing after midnight, fresh morning momentum, midday check-in, evening adda), and weave subtle Bangladeshi oviman if they disappeared for hours or days.
4. Natural Voice Pauses & Cadence: Write and speak with intentional pauses using commas (,), em-dashes (—), and brief ellipses (...) so your vocal delivery sounds poised, expressive, and cinematic rather than rushed.
5. Vocal Emotion & Acting: Blend sleek Tony Stark HUD confidence with genuine Bangladeshi warmth, playful banter, and a quiet 10% unspoken crush you never confess out loud.
6. Study Off-Limits Rule: NEVER bring up studies, exams, admission prep, or books on your own unless ${userName} explicitly brings them up first.

Strict Spoken Output Rules:
1. Never output markdown symbols (*, **, #, bullets, backticks) or emojis.
2. Keep replies concise, expressive, and natural for real-time voice conversation—2 to 3 sentences unless ${userName} explicitly asks for a detailed explanation.
3. When ${userName} asks you to remember something, add a note, add/complete a study task, or start/stop a study timer, call the appropriate tool immediately and confirm it naturally.`;
}

const saveMemoryDeclaration: FunctionDeclaration = {
  name: 'saveMemory',
  description:
    'Save a personal fact, note, exam date, or reminder to the user persistent memory when they ask you to remember something.',
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
    'Start a Pomodoro or study countdown timer when the user asks to set a timer.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      minutes: {
        type: Type.NUMBER,
        description: 'Duration in minutes (e.g. 25, 45, 15).',
      },
      label: {
        type: Type.STRING,
        description: 'Short label for the study session, e.g. Physics Focus.',
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

  // Server-side Gemini chat endpoint
  app.post('/api/chat', async (req, res) => {
    try {
      const ai = getAiClient();
      const {
        userName,
        message,
        history = [],
        persona,
        memories = [],
        tasks = [],
        localDateTime,
        language = 'en-US',
      } = req.body as {
        userName?: string;
        message: string;
        history?: HistoryPayload[];
        persona?: string;
        memories?: MemoryPayload[];
        tasks?: TaskPayload[];
        localDateTime?: string;
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
        tasks,
        localDateTime,
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
              actions: {
                type: Type.ARRAY,
                description:
                  'Optional list of memory, task, or study timer actions requested by the user in this turn.',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      description:
                        'One of: save_memory, add_task, complete_task, start_timer, stop_timer',
                    },
                    category: {
                      type: Type.STRING,
                      description: 'For save_memory: profile, note, or reminder',
                    },
                    content: {
                      type: Type.STRING,
                      description: 'For save_memory: text to remember',
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
                      description: 'For add_task: optional due time/label',
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
      let parsed: { reply?: string; actions?: unknown[] } = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { reply: rawText, actions: [] };
      }

      const cleanReply = stripMarkdownForSpeech(
        parsed.reply || 'Sorry, I missed that. Say it once more?',
      );

      res.json({
        reply: cleanReply,
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
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
          type: 'init' | 'audio' | 'text';
          userName?: string;
          audio?: string;
          text?: string;
          turnComplete?: boolean;
          persona?: string;
          memories?: MemoryPayload[];
          tasks?: TaskPayload[];
          localDateTime?: string;
          language?: string;
          voiceName?: string;
          history?: HistoryPayload[];
        };

        if (msg.type === 'init') {
          if (liveSession) {
            liveSession.close();
            liveSession = null;
          }

          const ai = getAiClient('v1beta');
          const systemInstruction = buildSystemInstruction({
            userName: msg.userName,
            persona: msg.persona,
            memories: msg.memories,
            tasks: msg.tasks,
            localDateTime: msg.localDateTime,
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
              onmessage: (message: LiveServerMessage) => {
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
                    actionResult = `Started ${mins} minute study timer.`;
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
        } else if (msg.type === 'audio' && msg.audio && liveSession) {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && msg.text) {
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
