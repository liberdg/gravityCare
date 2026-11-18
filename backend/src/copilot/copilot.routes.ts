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

function extractGeminiText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part: any) => typeof part?.text === 'string')
    .map((part: any) => part.text)
    .join('\n')
    .trim();
}

function getProviderError(payload: any): string {
  return String(payload?.error?.message || payload?.error?.status || '').toLowerCase();
}

copilotRouter.post('/chat', async (req: Request, res: Response) => {
  if (!allowRequest(req)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'Trop de demandes Copilot. Attends une minute avant de réessayer.' });
    return;
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Demande Copilot invalide.', details: parsed.error.flatten() });
    return;
  }

  const apiKey = process.env.AI_API_KEY;
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const model = process.env.AI_MODEL || 'gemini-3.8-flash';

  if (!apiKey) {
    res.status(503).json({ error: 'Copilot IA non configuré. Ajoute AI_API_KEY dans les variables d’environnement de Render.' });
    return;
  }
  if (provider !== 'gemini') {
    res.status(503).json({ error: 'Fournisseur IA non pris en charge par cette version. Configure AI_PROVIDER=gemini dans Render.' });
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

  const contents = [
    ...history.map(item => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }]
    })),
    {
      role: 'user',
      parts: [{
        text: JSON.stringify({
          request: message,
          astronaut_snapshot: context,
          note: 'This is a fictional demonstration snapshot, not a verified medical record.'
        })
      }]
    }
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents,
        generationConfig: { maxOutputTokens: 700, temperature: 0.4 }
      })
    });

    const payload: any = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const providerMessage = getProviderError(payload);
      console.error('[copilot] Gemini request failed:', upstream.status, providerMessage.slice(0, 300));

      if (upstream.status === 400 || upstream.status === 403) {
        res.status(502).json({ error: 'La clé Gemini ou le modèle est refusé. Vérifie AI_API_KEY et AI_MODEL dans Render.' });
      } else if (upstream.status === 429) {
        res.setHeader('Retry-After', '30');
        const quota = /quota|resource_exhausted|billing|limit:\s*0/.test(providerMessage);
        res.status(quota ? 503 : 429).json({
          error: quota
            ? 'Le quota gratuit Gemini est atteint pour le moment. Consulte les limites du projet dans Google AI Studio, puis réessaie lorsque le quota sera réinitialisé.'
            : 'Gemini reçoit trop de demandes. Attends 30 secondes puis réessaie.'
        });
      } else if (upstream.status === 404) {
        res.status(502).json({ error: 'Modèle Gemini introuvable. Vérifie le nom indiqué dans AI_MODEL sur Render.' });
      } else {
        res.status(502).json({ error: 'Gemini n’a pas pu traiter la demande. Consulte les journaux Render pour le détail.' });
      }
      return;
    }

    const answer = extractGeminiText(payload);
    if (!answer) {
      const reason = String(payload?.candidates?.[0]?.finishReason || '');
      res.status(502).json({
        error: reason === 'SAFETY'
          ? 'Gemini a bloqué cette demande pour des raisons de sécurité. Reformule ta question.'
          : 'Gemini a renvoyé une réponse vide. Réessaie avec une demande plus courte.'
      });
      return;
    }
    res.json({ answer, mode, model, provider: 'gemini', disclaimer: 'Démonstration fictive uniquement — ne constitue pas un diagnostic médical.' });
  } catch (error) {
    console.error('[copilot] Gemini connection error:', error instanceof Error ? error.message : 'unknown error');
    res.status(502).json({ error: 'Impossible de joindre Gemini. Vérifie la connexion réseau et les journaux Render.' });
  } finally {
    clearTimeout(timeout);
  }
});
