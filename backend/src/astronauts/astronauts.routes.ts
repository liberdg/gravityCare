import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../common/prisma.js';
import { AppError } from '../common/errorHandler.js';
import { Role } from '../common/constants.js';
import { requireRoles } from '../auth/auth.middleware.js';
import { authorizeProfile, medicalView, operationalView, visibleAstronautIds } from '../access/access.js';
import { writeAudit } from '../common/audit.js';
import { openDraft } from '../alerts/alert.service.js';
import { CRITICAL_SYMPTOM_PATTERNS } from '../alerts/alert.rules.js';

export const astronautsRouter = Router();

const RANK = { CRITICAL: 4, WARNING: 3, WATCH: 2, INFO: 1 } as Record<string, number>;

function summarize(open: Array<{ id: string; severity: string; title: string; status: string; createdAt: Date }>) {
  const highest = [...open].sort((a, b) => (RANK[b.severity] ?? 0) - (RANK[a.severity] ?? 0))[0]?.severity ?? null;
  return { openCount: open.length, highest, items: open.slice(0, 8) };
}

astronautsRouter.get('/', async (req, res, next) => {
  try {
    const visibility = await visibleAstronautIds(req.user!);
    const where = Array.isArray(visibility) ? { id: { in: visibility } } : {};
    const profiles = await prisma.astronautProfile.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
        mission: true,
        assignments: {
          where: { active: true },
          include: { doctor: { select: { id: true, firstName: true, lastName: true } } }
        }
      },
      orderBy: { callSign: 'asc' }
    });

    const ids = profiles.map(profile => profile.id);
    const [openAlerts, latestVitals] = await Promise.all([
      prisma.alert.findMany({
        where: { astronautId: { in: ids }, status: { not: 'RESOLVED' } },
        select: { id: true, astronautId: true, severity: true, title: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.vitalMeasurement.findMany({
        where: { astronautId: { in: ids } },
        orderBy: { measuredAt: 'desc' },
        distinct: ['astronautId', 'type']
      })
    ]);
    const alertsBy = new Map<string, typeof openAlerts>();
    for (const alert of openAlerts) {
      const list = alertsBy.get(alert.astronautId) ?? [];
      list.push(alert);
      alertsBy.set(alert.astronautId, list);
    }
    const latestBy = new Map<string, typeof latestVitals>();
    for (const vital of latestVitals) {
      const list = latestBy.get(vital.astronautId) ?? [];
      list.push(vital);
      latestBy.set(vital.astronautId, list);
    }

    const payload = profiles.map(profile => {
      const summary = summarize(alertsBy.get(profile.id) ?? []);
      if (req.user!.role === Role.GROUND_CREW || req.user!.role === Role.ADMIN) {
        return operationalView(profile, summary);
      }
      return { ...medicalView(profile), alertSummary: summary, latestVitals: latestBy.get(profile.id) ?? [] };
    });
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

astronautsRouter.get('/:id', async (req, res, next) => {
  try {
    const { profile, scope } = await authorizeProfile(req.user!, req.params.id);
    const open = await prisma.alert.findMany({
      where: { astronautId: profile.id, status: { not: 'RESOLVED' } },
      select: { id: true, severity: true, title: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 8
    });
    const summary = summarize(open);
    if (scope === 'medical') {
      const vitals = await prisma.vitalMeasurement.findMany({
        where: { astronautId: profile.id },
        orderBy: { measuredAt: 'desc' },
        take: 40
      });
      const notes = await prisma.medicalNote.findMany({
        where: { astronautId: profile.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { doctor: { select: { firstName: true, lastName: true } } }
      });
      await writeAudit(req.user!.userId, 'READ_RECORD', profile.id);
      res.json({ ...medicalView(profile), alertSummary: summary, vitals, notes });
      return;
    }
    await writeAudit(req.user!.userId, 'READ_OPERATIONAL', profile.id);
    res.json(operationalView(profile, summary));
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  allergies: z.array(z.string()).optional(),
  intolerances: z.array(z.string()).optional(),
  preferences: z.array(z.string()).optional(),
  medicalHistory: z.array(z.string()).optional(),
  currentTreatments: z.array(z.string()).optional(),
  conditions: z.array(z.string()).optional(),
  weightKg: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  age: z.number().int().positive().optional()
});

astronautsRouter.patch('/:id', requireRoles(Role.DOCTOR, Role.ADMIN), async (req, res, next) => {
  try {
    if (req.user!.role === Role.DOCTOR) await authorizeProfile(req.user!, req.params.id);
    const body = patchSchema.parse(req.body);
    const data: Record<string, unknown> = {};
    for (const key of ['allergies', 'intolerances', 'preferences', 'medicalHistory', 'currentTreatments', 'conditions'] as const) {
      if (body[key]) data[key] = JSON.stringify(body[key]);
    }
    if (body.weightKg != null) data.weightKg = body.weightKg;
    if (body.heightCm != null) data.heightCm = body.heightCm;
    if (body.age != null) data.age = body.age;
    const updated = await prisma.astronautProfile.update({ where: { id: req.params.id }, data });
    await writeAudit(req.user!.userId, 'UPDATE_PROFILE', req.params.id);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const symptomSchema = z.object({ content: z.string().min(2) });

astronautsRouter.post('/:id/symptoms', async (req, res, next) => {
  try {
    const { scope } = await authorizeProfile(req.user!, req.params.id);
    if (scope !== 'medical') throw new AppError(403, 'Cannot file a symptom on this account');
    const body = symptomSchema.parse(req.body);
    const symptom = await prisma.symptomReport.create({
      data: { astronautId: req.params.id, content: body.content, tags: '[]' }
    });
    const critical = CRITICAL_SYMPTOM_PATTERNS.some(item => item.pattern.test(body.content));
    let alert = null;
    if (critical) {
      alert = await openDraft(req.params.id, {
        type: 'SYMPTOM',
        severity: 'CRITICAL',
        title: 'Symptom keyword requires immediate escalation',
        description: 'A reported symptom matched a prototype critical keyword. This is not a diagnosis. Follow the mission emergency procedure.',
        payload: { symptomId: symptom.id, sourceNote: 'Keyword escalation. Fictional demo.' }
      });
    }
    res.status(201).json({ symptom, alert });
  } catch (err) {
    next(err);
  }
});

const noteSchema = z.object({ content: z.string().min(2) });

astronautsRouter.post('/:id/notes', requireRoles(Role.DOCTOR), async (req, res, next) => {
  try {
    await authorizeProfile(req.user!, req.params.id);
    const body = noteSchema.parse(req.body);
    const note = await prisma.medicalNote.create({
      data: { astronautId: req.params.id, doctorId: req.user!.userId, content: body.content }
    });
    await writeAudit(req.user!.userId, 'MEDICAL_NOTE', req.params.id);
    res.status(201).json(note);
  } catch (err) {
    next(err);
  }
});
