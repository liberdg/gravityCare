import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../common/prisma.js';
import { AppError } from '../common/errorHandler.js';
import { Role } from '../common/constants.js';
import { requireRoles } from '../auth/auth.middleware.js';
import { authorizeProfile } from '../access/access.js';
import { writeAudit } from '../common/audit.js';
import { recommendationFor } from './nutrition.service.js';
import { parseJsonValue } from '../common/json.js';

export const nutritionRouter = Router();

const logSchema = z.object({
  astronautId: z.string(),
  date: z.string(),
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  items: z.array(z.object({
    foodCode: z.string().optional(),
    name: z.string(),
    portions: z.number().positive().optional(),
    quantity: z.string().optional(),
    kcal: z.number().optional(),
    proteinG: z.number().optional(),
    carbsG: z.number().optional(),
    fatG: z.number().optional()
  })),
  hydrationMl: z.number().optional(),
  notes: z.string().optional()
});

nutritionRouter.get('/menu/:missionId', async (req, res, next) => {
  try {
    const rows = await prisma.missionMenuItem.findMany({
      where: { missionId: req.params.missionId, available: true },
      include: { food: true }
    });
    res.json(rows.map(row => ({
      ...row.food,
      allergens: parseJsonValue(row.food.allergens, []),
      tags: parseJsonValue(row.food.tags, []),
      available: row.available,
      estimate: true
    })));
  } catch (err) {
    next(err);
  }
});

nutritionRouter.post('/log', async (req, res, next) => {
  try {
    const body = logSchema.parse(req.body);
    const { scope } = await authorizeProfile(req.user!, body.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'Ground and admin accounts cannot write nutrition logs');

    const totalKcal = body.items.reduce((s, i) => s + (i.kcal || 0), 0);
    const totalProtein = body.items.reduce((s, i) => s + (i.proteinG || 0), 0);
    const totalCarbs = body.items.reduce((s, i) => s + (i.carbsG || 0), 0);
    const totalFat = body.items.reduce((s, i) => s + (i.fatG || 0), 0);

    const log = await prisma.nutritionLog.create({
      data: {
        astronautId: body.astronautId,
        date: new Date(body.date),
        mealType: body.mealType,
        items: JSON.stringify(body.items),
        estimatedKcal: totalKcal || null,
        proteinG: totalProtein || null,
        carbsG: totalCarbs || null,
        fatG: totalFat || null,
        hydrationMl: body.hydrationMl,
        notes: body.notes
      }
    });
    await writeAudit(req.user!.userId, 'NUTRITION_LOG', body.astronautId, body.mealType);
    res.status(201).json(log);
  } catch (err) {
    next(err);
  }
});

nutritionRouter.get('/astronaut/:astronautId', async (req, res, next) => {
  try {
    const { scope } = await authorizeProfile(req.user!, req.params.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'Nutrition logs are clinical data');
    const logs = await prisma.nutritionLog.findMany({
      where: { astronautId: req.params.astronautId },
      orderBy: { date: 'desc' },
      take: 60
    });
    res.json(logs.map(log => ({ ...log, items: parseJsonValue(log.items, []) })));
  } catch (err) {
    next(err);
  }
});

nutritionRouter.get('/recommendations/:astronautId', async (req, res, next) => {
  try {
    const { scope } = await authorizeProfile(req.user!, req.params.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'Nutrition recommendations are clinical data');
    const lang = req.query.lang === 'fr' ? 'fr' : 'en';
    const result = await recommendationFor(req.params.astronautId, lang);
    if (!result) throw new AppError(404, 'Astronaut not found');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

nutritionRouter.get('/report/:astronautId', async (req, res, next) => {
  try {
    const { scope, profile } = await authorizeProfile(req.user!, req.params.astronautId);
    if (scope !== 'medical') throw new AppError(403, 'Nutrition report is clinical data');
    const result = await recommendationFor(req.params.astronautId);
    if (!result) throw new AppError(404, 'Astronaut not found');
    const previous = await prisma.nutritionPlan.findMany({
      where: { astronautId: profile.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { status: true, createdAt: true, reviewNote: true }
    });
    res.json({
      fictitious: true,
      callSign: profile.callSign,
      currentStatus: result.recommendation.dataQuality,
      observations: result.recommendation.observations,
      gaps: result.recommendation.warnings,
      nutrientsToWatch: result.recommendation.nutrientsToWatch,
      recommendations: result.recommendation.priorities,
      shortTermGoals: result.recommendation.shortTermGoals,
      evolution: previous,
      needsMedicalValidation: result.review.status !== 'VALIDATED',
      review: result.review,
      disclaimer: result.recommendation.disclaimer
    });
  } catch (err) {
    next(err);
  }
});

const reviewSchema = z.object({
  status: z.enum(['VALIDATED', 'MODIFIED', 'REJECTED']),
  note: z.string().min(3)
});

nutritionRouter.post(
  '/recommendations/:astronautId/review',
  requireRoles(Role.DOCTOR),
  async (req, res, next) => {
    try {
      await authorizeProfile(req.user!, req.params.astronautId);
      const body = reviewSchema.parse(req.body);
      const result = await recommendationFor(req.params.astronautId);
      if (!result) throw new AppError(404, 'Astronaut not found');
      const saved = await prisma.nutritionPlan.create({
        data: {
          astronautId: req.params.astronautId,
          payload: JSON.stringify(result.recommendation),
          status: body.status,
          reviewerId: req.user!.userId,
          reviewNote: body.note,
          reviewedAt: new Date()
        }
      });
      await writeAudit(req.user!.userId, 'NUTRITION_REVIEW', req.params.astronautId, body.status);
      res.status(201).json(saved);
    } catch (err) {
      next(err);
    }
  }
);
