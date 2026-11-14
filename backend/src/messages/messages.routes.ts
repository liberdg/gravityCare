import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../common/prisma.js';
import { AppError } from '../common/errorHandler.js';
import { authorizeProfile } from '../access/access.js';
import { Role } from '../common/constants.js';
import { writeAudit } from '../common/audit.js';

export const messagesRouter = Router();

async function assertPair(senderId: string, senderRole: string, receiverId: string) {
  if (senderRole === Role.ASTRONAUT) {
    const profile = await prisma.astronautProfile.findUnique({ where: { userId: senderId } });
    if (!profile) throw new AppError(403, 'No crew profile');
    const link = await prisma.doctorAssignment.findFirst({
      where: { astronautId: profile.id, doctorId: receiverId, active: true }
    });
    if (!link) throw new AppError(403, 'You can message only an assigned physician');
    return;
  }
  if (senderRole === Role.DOCTOR) {
    const profile = await prisma.astronautProfile.findUnique({ where: { userId: receiverId } });
    if (!profile) throw new AppError(403, 'Receiver is not a crewmember');
    const link = await prisma.doctorAssignment.findFirst({
      where: { astronautId: profile.id, doctorId: senderId, active: true }
    });
    if (!link) throw new AppError(403, 'This crewmember is not assigned to you');
    return;
  }
  throw new AppError(403, 'This role cannot use the clinical message channel');
}

messagesRouter.get('/', async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: req.user!.userId }, { receiverId: req.user!.userId }]
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        sender: { select: { firstName: true, lastName: true, role: true } },
        receiver: { select: { firstName: true, lastName: true, role: true } }
      }
    });
    res.json(messages.map(message => ({ ...message, simulated: true })));
  } catch (err) {
    next(err);
  }
});

const messageSchema = z.object({
  receiverId: z.string(),
  content: z.string().min(1),
  alertId: z.string().optional(),
  clientId: z.string().optional()
});

messagesRouter.post('/', async (req, res, next) => {
  try {
    const body = messageSchema.parse(req.body);
    await assertPair(req.user!.userId, req.user!.role, body.receiverId);
    if (body.clientId) {
      const prior = await prisma.message.findFirst({
        where: { senderId: req.user!.userId, clientId: body.clientId }
      });
      if (prior) return res.json(prior);
    }
    const message = await prisma.message.create({
      data: {
        senderId: req.user!.userId,
        receiverId: body.receiverId,
        content: body.content,
        alertId: body.alertId,
        clientId: body.clientId,
        simulated: true
      }
    });
    await writeAudit(req.user!.userId, 'MESSAGE', body.receiverId);
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

const syncSchema = z.object({
  operations: z.array(z.object({
    clientId: z.string(),
    kind: z.enum(['message', 'symptom', 'nutrition']),
    payload: z.record(z.any())
  }))
});

messagesRouter.post('/sync', async (req, res, next) => {
  try {
    const body = syncSchema.parse(req.body);
    const results = [];
    for (const op of body.operations) {
      const already = await prisma.syncOperation.findUnique({
        where: { userId_clientId: { userId: req.user!.userId, clientId: op.clientId } }
      });
      if (already) {
        results.push({ clientId: op.clientId, status: 'ALREADY_SYNCED' });
        continue;
      }
      if (op.kind === 'message') {
        const payload = messageSchema.parse({ ...op.payload, clientId: op.clientId });
        await assertPair(req.user!.userId, req.user!.role, payload.receiverId);
        await prisma.message.create({
          data: {
            senderId: req.user!.userId,
            receiverId: payload.receiverId,
            content: payload.content,
            alertId: payload.alertId,
            clientId: op.clientId,
            simulated: true
          }
        });
      } else if (op.kind === 'symptom') {
        const content = z.object({ astronautId: z.string(), content: z.string().min(2) }).parse(op.payload);
        const { scope } = await authorizeProfile(req.user!, content.astronautId);
        if (scope !== 'medical') throw new AppError(403, 'Cannot sync a symptom for this role');
        await prisma.symptomReport.create({
          data: { astronautId: content.astronautId, content: content.content }
        });
      } else {
        throw new AppError(400, 'Unsupported offline operation');
      }
      await prisma.syncOperation.create({
        data: {
          userId: req.user!.userId,
          clientId: op.clientId,
          kind: op.kind,
          payload: JSON.stringify(op.payload),
          status: 'SYNCED'
        }
      });
      results.push({ clientId: op.clientId, status: 'SYNCED' });
    }
    res.json({ simulatedChannel: true, results });
  } catch (err) {
    next(err);
  }
});
