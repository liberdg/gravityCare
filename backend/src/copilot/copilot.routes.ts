import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

export const copilotRouter = Router();

const historyItem = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(1800)
});

const requestSchema = z.object({
  mode: z.enum(['chat', 'analysis']).default('chat'),
  message: z.string().trim().min(1).max(1800),
  history: z.array(historyItem).max(8).default([]),
  context: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({})
});

const requestsByIp = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;

function allowRequest(req: Request): boolean {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const current = requestsByIp.get(ip);
  if (!current || current.resetAt <= now) {
    requestsByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}

function extractOutput(payload: any): string {
  if (typeof payload?.output_text === 'string') return payload.output_text.trim();
  const chunks: string[] = [];
  for (const item of payload?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

copilotRouter.post('/chat', async (req: Request, res: Response) => {
  if (!allowRequest(req)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Too many Copilot requests. Please wait one minute.' });
    return;
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid Copilot request.', details: parsed.error.flatten() });
    return;
  }

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  if (!apiKey) {
    res.status(503).json({ error: 'Copilot AI is not configured. Add AI_API_KEY in Render Environment.' });
    return;
  }

  const { mode, message, history, context } = parsed.data;
  const instructions = [
    'You are GravityCare Copilot, a careful assistant for a fictional astronaut-health demonstration.',
    'Use only the supplied context. It may be incomplete, simulated, or user-entered. Never invent measurements, diagnoses, medical history, or sensor readings.',
    'You are not a medical device and must not diagnose, prescribe, recommend medication changes, or replace a flight surgeon.',
    'For severe symptoms or potentially life-threatening signs, clearly instruct the crew to follow mission emergency procedures and contact the flight surgeon/medical officer immediately. Never delay escalation for more analysis.',
    'Distinguish measured values from estimates and missing data. Explain uncertainty and ask a concise follow-up question when context is insufficient.',
    'Be practical, concise, calm, and explain technical terms. Reply in the language used by the user (French or English).',
    mode === 'analysis'
      ? 'Perform a structured review of the supplied astronaut snapshot and symptom report. State: observations, possible non-diagnostic interpretations, missing information, safe next steps, and when to escalate. Do not infer a cause from correlation.'
      : 'Have a natural multi-turn conversation. Use the recent conversation history when relevant and relate answers to the supplied astronaut snapshot.'
  ].join('\n');

  const input = [
    ...history.map(item => ({ role: item.role, content: item.content })),
    {
      role: 'user',
      content: JSON.stringify({
        request: message,
        astronaut_snapshot: context,
        note: 'This is a fictional demonstration snapshot, not a verified medical record.'
      })
    }
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, instructions, input, store: false, max_output_tokens: 700 })
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      let providerError: any = {};
      try { providerError = JSON.parse(detail)?.error ?? {}; } catch { /* provider returned non-JSON */ }
      const providerCode = String(providerError.code || providerError.type || '').toLowerCase();
      console.error('[copilot] OpenAI request failed:', upstream.status, providerCode, detail.slice(0, 500));

      if (upstream.status === 401) {
        res.status(502).json({ error: 'Clé API OpenAI refusée. Vérifie AI_API_KEY dans Render.' });
      } else if (upstream.status === 429 && (providerCode.includes('insufficient_quota') || providerCode.includes('credit_balance_exhausted') || providerCode.includes('spend_limit_exceeded') || providerCode.includes('usage_limit_exceeded') || providerCode.includes('billing') || providerCode.includes('quota'))) {
        res.status(503).json({ error: 'Crédit API OpenAI épuisé ou budget mensuel atteint. Ajoute un moyen de paiement ou augmente le budget sur OpenAI Platform > Billing, puis réessaie.' });
      } else if (upstream.status === 429) {
        res.setHeader('Retry-After', '30');
        res.status(429).json({ error: 'Limite temporaire de requêtes OpenAI atteinte. Attends 30 secondes puis réessaie.' });
      } else if (upstream.status === 404 || providerCode.includes('model_not_found')) {
        res.status(502).json({ error: 'Modèle OpenAI indisponible pour cette clé. Vérifie AI_MODEL dans Render.' });
      } else {
        res.status(502).json({ error: 'Le fournisseur IA n’a pas pu traiter la demande. Consulte les journaux Render pour le détail.' });
      }
      return;
    }

    const payload = await upstream.json();
    const answer = extractOutput(payload);
    if (!answer) {
      res.status(502).json({ error: 'The AI provider returned an empty response.' });
      return;
    }
    res.json({ answer, mode, model, provider: 'openai', disclaimer: 'Fictional demo only — not a medical diagnosis.' });
  } catch (error) {
    console.error('[copilot] Request error:', error);
    res.status(502).json({ error: 'Unable to reach the AI provider. Check network access and Render logs.' });
  } finally {
    clearTimeout(timeout);
  }
});
