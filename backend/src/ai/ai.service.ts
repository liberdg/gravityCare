import { prisma } from '../common/prisma.js';
import { parseJsonArray, parseJsonValue } from '../common/json.js';
import { analyzeWithRules, type AiReport, type AnalysisContext } from './rule.provider.js';

async function buildContext(alertId: string): Promise<AnalysisContext> {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: {
      astronaut: {
        include: {
          mission: true,
          vitals: { orderBy: { measuredAt: 'desc' }, take: 40 },
          nutritionLogs: { orderBy: { date: 'desc' }, take: 14 },
          symptoms: { orderBy: { reportedAt: 'desc' }, take: 5 }
        }
      }
    }
  });
  if (!alert) throw new Error('Alert not found');

  const vitals = alert.astronaut.vitals;
  const sameType = vitals.filter(v => v.type === alert.type || (alert.type === 'WEIGHT_TREND' && v.type === 'WEIGHT'));
  let historySummary = 'No earlier personal series was on file for this signal.';
  if (sameType.length >= 2) {
    const values = sameType.map(v => v.value);
    const avg = values.reduce((s, n) => s + n, 0) / values.length;
    historySummary = `${sameType.length} prior points of this signal are on file. Their mean is ${avg.toFixed(1)}. Latest is ${values[0]}.`;
  }

  const sleep = vitals.find(v => v.type === 'SLEEP_HOURS');
  const activity = vitals.find(v => v.type === 'ACTIVITY_MIN');
  const logs = alert.astronaut.nutritionLogs;
  const hydration = logs.find(l => l.hydrationMl != null)?.hydrationMl ?? null;
  const kcalValues = logs.map(l => l.estimatedKcal).filter((n): n is number => n != null);
  const proteinValues = logs.map(l => l.proteinG).filter((n): n is number => n != null);

  return {
    alert: {
      id: alert.id,
      astronautId: alert.astronautId,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      payload: parseJsonValue(alert.payload, null),
      createdAt: alert.createdAt.toISOString()
    },
    astronaut: {
      callSign: alert.astronaut.callSign,
      age: alert.astronaut.age,
      sex: alert.astronaut.sex,
      allergies: parseJsonArray(alert.astronaut.allergies),
      conditions: parseJsonArray(alert.astronaut.conditions),
      missionName: alert.astronaut.mission?.name ?? null,
      missionDay: alert.astronaut.missionDay,
      demoScenario: alert.astronaut.demoScenario
    },
    latestVitals: vitals.slice(0, 12).map(v => ({
      type: v.type,
      value: v.value,
      unit: v.unit,
      measuredAt: v.measuredAt.toISOString()
    })),
    historySummary,
    symptoms: alert.astronaut.symptoms.map(s => s.content),
    sleepHours: sleep?.value ?? null,
    activityMin: activity?.value ?? null,
    hydrationMl: hydration,
    intakeKcal: kcalValues.length ? kcalValues.reduce((s, n) => s + n, 0) / kcalValues.length : null,
    intakeProtein: proteinValues.length ? proteinValues.reduce((s, n) => s + n, 0) / proteinValues.length : null
  };
}

async function tryExternalModel(ctx: AnalysisContext): Promise<AiReport | null> {
  const key = process.env.AI_API_KEY;
  const base = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  if (!key || !base) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You are a decision-support assistant for a fictional space-medicine demo. Return one JSON object matching the provided keys. Do not diagnose, prescribe, or invent missing numbers. Say when data are absent.'
          },
          {
            role: 'user',
            content: JSON.stringify({ instruction: 'Fill an analysis report. engine must be "external".', context: ctx })
          }
        ]
      })
    });
    if (!response.ok) return null;
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = body.choices?.[0]?.message?.content ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as AiReport;
    parsed.engine = 'external';
    parsed.alertId = ctx.alert.id;
    parsed.astronautId = ctx.alert.astronautId;
    parsed.limits = [...(parsed.limits ?? []), 'External model output. Still not a medical decision.'];
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeAlertById(alertId: string): Promise<AiReport> {
  const ctx = await buildContext(alertId);
  const external = await tryExternalModel(ctx);
  if (external) return external;
  const report = analyzeWithRules(ctx);
  if (process.env.AI_API_KEY && process.env.AI_BASE_URL) {
    report.limits.push('External AI service was configured but did not return a usable report. Rule engine was used.');
  }
  return report;
}

export async function storeAnalysis(alertId: string): Promise<AiReport> {
  const existing = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!existing) throw new Error('Alert not found');
  const critical = existing.severity === 'CRITICAL';
  if (!critical) {
    await prisma.alert.update({
      where: { id: alertId },
      data: { status: 'ANALYZING' }
    });
  }
  try {
    const report = await analyzeAlertById(alertId);
    await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: critical ? 'SENT_TO_DOCTOR' : 'ANALYZED',
        aiReport: JSON.stringify(report)
      }
    });
    await prisma.healthReport.create({
      data: {
        astronautId: report.astronautId,
        alertId,
        kind: 'AI_ALERT',
        payload: JSON.stringify(report)
      }
    });
    return report;
  } catch (error) {
    if (!critical) {
      await prisma.alert.update({
        where: { id: alertId },
        data: { status: 'NEW' }
      }).catch(() => undefined);
    }
    throw error;
  }
}
