import { Router } from 'express';
import { prisma } from '../common/prisma.js';
import { authorizeProfile } from '../access/access.js';
import { AppError } from '../common/errorHandler.js';
import { recommendationFor } from '../nutrition/nutrition.service.js';
import { parseJsonValue } from '../common/json.js';

export const reportsRouter = Router();

reportsRouter.get('/astronaut/:astronautId', async (req, res, next) => {
  try {
    const { scope, profile } = await authorizeProfile(req.user!, req.params.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'Health reports are clinical data');
    const nutrition = await recommendationFor(profile.id);
    const reports = await prisma.healthReport.findMany({
      where: { astronautId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json({
      fictitious: true,
      callSign: profile.callSign,
      nutrition,
      analyses: reports.map(report => ({ ...report, payload: parseJsonValue(report.payload, null) }))
    });
  } catch (err) {
    next(err);
  }
});
