import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../common/prisma.js';
import { AppError } from '../common/errorHandler.js';
import { requireRoles } from '../auth/auth.middleware.js';
import { Role, AlertStatus } from '../common/constants.js';
import { authorizeProfile, visibleAstronautIds } from '../access/access.js';
import { storeAnalysis } from '../ai/ai.service.js';
import { writeAudit } from '../common/audit.js';
import { presentAlert, THRESHOLD_SOURCE } from './alert.rules.js';
import { parseJsonValue } from '../common/json.js';

export const alertsRouter = Router();

alertsRouter.get('/rules', (_req, res) => {
  res.json({
    source: THRESHOLD_SOURCE,
    levels: ['INFO', 'WATCH', 'WARNING', 'CRITICAL'],
    statuses: Object.values(AlertStatus),
    document: 'docs/THRESHOLDS.md'
  });
});

alertsRouter.get('/', async (req, res, next) => {
  try {
    const visibility = await visibleAstronautIds(req.user!);
    const status = req.query.status as string | undefined;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (Array.isArray(visibility)) where.astronautId = { in: visibility };

    const alerts = await prisma.alert.findMany({
      where,
      include: {
        astronaut: {
          select: { callSign: true, agency: true, user: { select: { firstName: true, lastName: true } } }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const operational = req.user!.role === Role.GROUND_CREW || req.user!.role === Role.ADMIN;
    const lang = req.query.lang === 'fr' ? 'fr' : 'en';
    res.json(alerts.map(alert => {
      const payload = parseJsonValue(alert.payload, null);
      const copy = presentAlert(alert.type, alert.severity, alert.title, alert.description, payload, lang);
      if (!operational) return { ...alert, ...copy, aiReport: parseJsonValue(alert.aiReport, null), payload };
      return {
        id: alert.id,
        astronautId: alert.astronautId,
        callSign: alert.astronaut.callSign,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        title: copy.title,
        createdAt: alert.createdAt,
        operational: true
      };
    }));
  } catch (err) {
    next(err);
  }
});

const createAlertSchema = z.object({
  astronautId: z.string(),
  type: z.string(),
  severity: z.enum(['INFO', 'WATCH', 'WARNING', 'CRITICAL']),
  title: z.string(),
  description: z.string(),
  payload: z.record(z.any()).optional()
});

alertsRouter.post('/', async (req, res, next) => {
  try {
    const body = createAlertSchema.parse(req.body);
    const { scope } = await authorizeProfile(req.user!, body.astronautId);
    if (scope !== 'medical' && req.user!.role !== Role.ADMIN) {
      throw new AppError(403, 'Cannot create a clinical alert with this role');
    }
    const alert = await prisma.alert.create({
      data: {
        astronautId: body.astronautId,
        type: body.type,
        severity: body.severity,
        title: body.title,
        description: body.description,
        payload: body.payload ? JSON.stringify(body.payload) : null,
        status: body.severity === 'CRITICAL' ? AlertStatus.SENT_TO_DOCTOR : AlertStatus.NEW
      }
    });
    res.status(201).json(alert);
    if (body.severity !== 'CRITICAL') {
      void storeAnalysis(alert.id).catch(error => console.error('[analysis]', error));
    } else {
      void storeAnalysis(alert.id).catch(error => console.error('[analysis]', error));
    }
  } catch (err) {
    next(err);
  }
});

alertsRouter.post('/:id/analyze', async (req, res, next) => {
  try {
    const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!alert) throw new AppError(404, 'Alert not found');
    const { scope } = await authorizeProfile(req.user!, alert.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'Analysis is limited to the crewmember and the assigned physician');
    const report = await storeAnalysis(alert.id);
    const updated = await prisma.alert.findUnique({ where: { id: alert.id } });
    res.json({ alert: updated, report });
  } catch (err) {
    next(err);
  }
});

alertsRouter.patch('/:id/status', requireRoles(Role.DOCTOR, Role.ADMIN), async (req, res, next) => {
  try {
    const status = z.object({ status: z.enum(['NEW', 'ANALYZING', 'ANALYZED', 'SENT_TO_DOCTOR', 'IN_PROGRESS', 'RESOLVED']) }).parse(req.body).status;
    const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
    if (!alert) throw new AppError(404, 'Alert not found');
    if (req.user!.role === Role.DOCTOR) await authorizeProfile(req.user!, alert.astronautId);
    const updated = await prisma.alert.update({
      where: { id: alert.id },
      data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null }
    });
    await writeAudit(req.user!.userId, 'ALERT_STATUS', alert.id, status);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
