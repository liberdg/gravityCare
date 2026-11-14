import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../common/prisma.js';
import { AppError } from '../common/errorHandler.js';
import { authorizeProfile } from '../access/access.js';
import { syncMeasurementAlerts } from '../alerts/alert.service.js';

export const demoRouter = Router();

const schema = z.object({
  astronautId: z.string(),
  scenario: z.enum(['physio-warning', 'critical-spo2'])
});

demoRouter.post('/measure', async (req, res, next) => {
  try {
    const body = schema.parse(req.body);
    const { scope } = await authorizeProfile(req.user!, body.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'Demo clinical measures require a clinical role');

    const reading = body.scenario === 'critical-spo2'
      ? { type: 'SPO2', value: 88, unit: '%', notes: 'FICTIONAL critical demonstration. Not a real measurement.' }
      : { type: 'HR', value: 142, unit: 'BPM', notes: 'FICTIONAL warning demonstration. Not a real measurement.' };

    const vital = await prisma.vitalMeasurement.create({
      data: {
        astronautId: body.astronautId,
        type: reading.type,
        value: reading.value,
        unit: reading.unit,
        source: 'SIMULATED',
        notes: reading.notes
      }
    });
    const alerts = await syncMeasurementAlerts(body.astronautId);
    const created = alerts.filter(alert => alert.type === reading.type);
    res.status(201).json({
      fictitious: true,
      scenario: body.scenario,
      vital,
      alerts: created,
      note: 'Simulated demonstration event. Critical alerts are marked sent to the physician before analysis finishes.'
    });
  } catch (err) {
    next(err);
  }
});
