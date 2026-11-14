import { prisma } from '../common/prisma.js';
import { assessSeries, type AlertDraft, type RulePoint } from './alert.rules.js';
import { AlertStatus } from '../common/constants.js';

function statusFor(severity: AlertDraft['severity']): string {
  if (severity === 'CRITICAL') return AlertStatus.SENT_TO_DOCTOR;
  return AlertStatus.NEW;
}

export async function openDraft(astronautId: string, draft: AlertDraft) {
  const existing = await prisma.alert.findFirst({
    where: {
      astronautId,
      type: draft.type,
      status: { not: AlertStatus.RESOLVED }
    }
  });
  if (existing) return existing;

  return prisma.alert.create({
    data: {
      astronautId,
      type: draft.type,
      severity: draft.severity,
      status: statusFor(draft.severity),
      title: draft.title,
      description: draft.description,
      payload: JSON.stringify(draft.payload)
    }
  });
}

export async function syncMeasurementAlerts(astronautId: string) {
  const vitals = await prisma.vitalMeasurement.findMany({
    where: { astronautId },
    orderBy: { measuredAt: 'asc' }
  });
  const byType = new Map<string, RulePoint[]>();
  const units = new Map<string, string>();
  for (const vital of vitals) {
    const list = byType.get(vital.type) ?? [];
    list.push({ value: vital.value, measuredAt: vital.measuredAt });
    byType.set(vital.type, list);
    units.set(vital.type, vital.unit);
  }

  const opened = [];
  for (const [type, points] of byType) {
    const draft = assessSeries(type, points, units.get(type) ?? '');
    if (!draft) continue;
    opened.push(await openDraft(astronautId, draft));
  }
  return opened;
}
