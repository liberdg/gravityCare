import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../common/prisma.js';
import { requireRoles } from '../auth/auth.middleware.js';
import { Role } from '../common/constants.js';

export const adminRouter = Router();
adminRouter.use(requireRoles(Role.ADMIN));

adminRouter.get('/users', async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true,
        astronautProfile: { select: { id: true, callSign: true } }
      },
      orderBy: { email: 'asc' }
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

const userPatch = z.object({
  role: z.enum(['ASTRONAUT', 'DOCTOR', 'GROUND_CREW', 'ADMIN']).optional(),
  isActive: z.boolean().optional()
});

adminRouter.patch('/users/:id', async (req, res, next) => {
  try {
    const body = userPatch.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: body,
      select: { id: true, email: true, role: true, isActive: true }
    });
    await prisma.auditLog.create({
      data: { userId: req.user!.userId, action: 'ADMIN_USER', resource: user.id, detail: JSON.stringify(body) }
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

const createUser = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(['ASTRONAUT', 'DOCTOR', 'GROUND_CREW', 'ADMIN'])
});

adminRouter.post('/users', async (req, res, next) => {
  try {
    const body = createUser.parse(req.body);
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        passwordHash: await bcrypt.hash(body.password, 10),
        firstName: body.firstName,
        lastName: body.lastName,
        role: body.role
      },
      select: { id: true, email: true, role: true }
    });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/audit', async (_req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { email: true, role: true } } }
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/missions', async (_req, res, next) => {
  try {
    const missions = await prisma.mission.findMany({ include: { astronauts: { select: { callSign: true } } } });
    res.json(missions);
  } catch (err) {
    next(err);
  }
});

const missionSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  startDate: z.string(),
  environment: z.string().optional(),
  waterBudgetMlPerCrewPerDay: z.number().int().positive().optional()
});

adminRouter.post('/missions', async (req, res, next) => {
  try {
    const body = missionSchema.parse(req.body);
    const mission = await prisma.mission.create({
      data: {
        name: body.name,
        code: body.code,
        startDate: new Date(body.startDate),
        environment: body.environment ?? 'MICROGRAVITY',
        waterBudgetMlPerCrewPerDay: body.waterBudgetMlPerCrewPerDay
      }
    });
    res.status(201).json(mission);
  } catch (err) {
    next(err);
  }
});
