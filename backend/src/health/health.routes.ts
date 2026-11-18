import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../common/prisma.js';
import { AppError } from '../common/errorHandler.js';
import { Role } from '../common/constants.js';
import { requireRoles } from '../auth/auth.middleware.js';
import { authorizeProfile } from '../access/access.js';
import { writeAudit } from '../common/audit.js';

export const healthLogRouter = Router();

const domains = ['SLEEP', 'WELLBEING', 'BONE', 'MUSCLE', 'ACTIVITY'] as const;
const createSchema = z.object({
  astronautId: z.string().min(1),
  domain: z.enum(domains),
  metric: z.string().trim().min(2).max(80),
  numericValue: z.number().finite().optional(),
  textValue: z.string().trim().max(500).optional(),
  unit: z.string().trim().max(24).optional(),
  notes: z.string().trim().max(1200).optional(),
  recordedAt: z.string().datetime().optional()
}).refine(data => data.numericValue !== undefined || Boolean(data.textValue), {
  message: 'Provide a numeric value or a text value'
});

healthLogRouter.get('/:astronautId', async (req, res, next) => {
  try {
    const { profile, scope } = await authorizeProfile(req.user!, req.params.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'Health logs are limited to the crewmember and assigned physician');
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const entries = await prisma.crewHealthLog.findMany({
      where: { astronautId: profile.id },
      orderBy: { recordedAt: 'desc' },
      take: limit,
      select: {
        id: true, domain: true, metric: true, numericValue: true, textValue: true,
        unit: true, notes: true, source: true, recordedAt: true, createdAt: true,
        author: { select: { firstName: true, lastName: true, role: true } }
      }
    });
    await writeAudit(req.user!.userId, 'READ_HEALTH_LOG', profile.id);
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

healthLogRouter.post('/', requireRoles(Role.ASTRONAUT, Role.DOCTOR), async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    const { profile, scope } = await authorizeProfile(req.user!, body.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'This role cannot record clinical or wellness information');
    const source = req.user!.role === Role.DOCTOR ? 'CLINICIAN' : 'SELF_REPORTED';
    const entry = await prisma.crewHealthLog.create({
      data: {
        astronautId: profile.id,
        authorId: req.user!.userId,
        domain: body.domain,
        metric: body.metric,
        numericValue: body.numericValue,
        textValue: body.textValue || null,
        unit: body.unit || null,
        notes: body.notes || null,
        source,
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date()
      },
      select: {
        id: true, domain: true, metric: true, numericValue: true, textValue: true,
        unit: true, notes: true, source: true, recordedAt: true, createdAt: true
      }
    });
    await writeAudit(req.user!.userId, 'CREATE_HEALTH_LOG', profile.id, body.domain + ':' + body.metric);
    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});
