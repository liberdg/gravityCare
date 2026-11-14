import { prisma } from './prisma.js';

export async function writeAudit(userId: string | null, action: string, resource: string, detail?: string) {
  await prisma.auditLog.create({
    data: { userId, action, resource, detail: detail ?? null }
  });
}
