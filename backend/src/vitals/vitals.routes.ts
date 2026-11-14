import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../common/prisma.js';
import { AppError } from '../common/errorHandler.js';
import { authorizeProfile } from '../access/access.js';
import { syncMeasurementAlerts } from '../alerts/alert.service.js';
import { storeAnalysis } from '../ai/ai.service.js';
import { writeAudit } from '../common/audit.js';

export const vitalsRouter = Router();

const createVitalSchema = z.object({
  astronautId: z.string(),
  type: z.string().min(2),
  value: z.number(),
  unit: z.string().min(1),
  measuredAt: z.string().datetime().optional(),
  source: z.string().optional(),
  notes: z.string().optional()
});

vitalsRouter.post('/', async (req, res, next) => {
  try {
    const body = createVitalSchema.parse(req.body);
    const { scope } = await authorizeProfile(req.user!, body.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'This role cannot record clinical measurements');

    const vital = await prisma.vitalMeasurement.create({
      data: {
        astronautId: body.astronautId,
        type: body.type,
        value: body.value,
        unit: body.unit,
        measuredAt: body.measuredAt ? new Date(body.measuredAt) : new Date(),
        source: body.source || 'MANUAL',
        notes: body.notes
      }
    });

    const alerts = await syncMeasurementAlerts(body.astronautId);
    await writeAudit(req.user!.userId, 'VITAL', body.astronautId, `${body.type}=${body.value}`);

    res.status(201).json({ vital, alerts });

    for (const alert of alerts) {
      if (!alert.aiReport) {
        void storeAnalysis(alert.id).catch(error => console.error('[analysis]', error));
      }
    }
  } catch (err) {
    next(err);
  }
});

vitalsRouter.get('/astronaut/:astronautId', async (req, res, next) => {
  try {
    const { scope } = await authorizeProfile(req.user!, req.params.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'Vitals are limited to the crewmember and the assigned physician');
    const type = req.query.type as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const vitals = await prisma.vitalMeasurement.findMany({
      where: { astronautId: req.params.astronautId, ...(type ? { type } : {}) },
      orderBy: { measuredAt: 'desc' },
      take: limit
    });
    res.json(vitals);
  } catch (err) {
    next(err);
  }
});
