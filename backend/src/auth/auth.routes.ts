import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../common/prisma.js';
import { AppError } from '../common/errorHandler.js';
import { authMiddleware } from './auth.middleware.js';
import { writeAudit } from '../common/audit.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: { astronautProfile: true }
    });
    if (!user || !user.isActive) throw new AppError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) throw new AppError(401, 'Invalid credentials');

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new AppError(500, 'Server misconfiguration');

    const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'];
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn }
    );

    await writeAudit(user.id, 'LOGIN', 'auth', user.role);
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        astronautProfileId: user.astronautProfile?.id ?? null,
        callSign: user.astronautProfile?.callSign ?? null
      }
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    await writeAudit(req.user!.userId, 'LOGOUT', 'auth');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        astronautProfile: { select: { id: true, callSign: true, agency: true } }
      }
    });
    if (!user || !user.isActive) throw new AppError(404, 'User not found');
    res.json(user);
  } catch (err) {
    next(err);
  }
});
