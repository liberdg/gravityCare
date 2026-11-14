import { prisma } from '../common/prisma.js';
import { AppError } from '../common/errorHandler.js';
import { Role } from '../common/constants.js';
import { parseJsonArray } from '../common/json.js';
import type { AuthPayload } from '../auth/auth.middleware.js';

export type Scope = 'medical' | 'operational' | 'admin';

const profileInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
  mission: true,
  assignments: {
    where: { active: true },
    include: { doctor: { select: { id: true, firstName: true, lastName: true } } }
  }
} as const;

export async function getProfileOrThrow(astronautId: string) {
  const profile = await prisma.astronautProfile.findUnique({
    where: { id: astronautId },
    include: profileInclude
  });
  if (!profile) throw new AppError(404, 'Astronaut not found');
  return profile;
}

export async function authorizeProfile(user: AuthPayload, astronautId: string): Promise<{ profile: Awaited<ReturnType<typeof getProfileOrThrow>>; scope: Scope }> {
  const profile = await getProfileOrThrow(astronautId);

  if (user.role === Role.ASTRONAUT) {
    if (profile.userId !== user.userId) throw new AppError(403, 'Access denied to this medical record');
    return { profile, scope: 'medical' };
  }

  if (user.role === Role.DOCTOR) {
    const assigned = profile.assignments.some(item => item.doctor.id === user.userId);
    if (!assigned) throw new AppError(403, 'This astronaut is not assigned to you');
    return { profile, scope: 'medical' };
  }

  if (user.role === Role.GROUND_CREW) return { profile, scope: 'operational' };
  if (user.role === Role.ADMIN) return { profile, scope: 'admin' };
  throw new AppError(403, 'Insufficient permissions');
}

export function medicalView(profile: Awaited<ReturnType<typeof getProfileOrThrow>>) {
  return {
    id: profile.id,
    userId: profile.userId,
    callSign: profile.callSign,
    agency: profile.agency,
    fictitious: profile.fictitious,
    demoScenario: profile.demoScenario,
    identity: {
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      email: profile.user.email
    },
    age: profile.age,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    sex: profile.sex,
    bloodType: profile.bloodType,
    flightHours: profile.flightHours,
    missionDay: profile.missionDay,
    baselineHrv: profile.baselineHrv,
    allergies: parseJsonArray(profile.allergies),
    intolerances: parseJsonArray(profile.intolerances),
    preferences: parseJsonArray(profile.preferences),
    medicalHistory: parseJsonArray(profile.medicalHistory),
    currentTreatments: parseJsonArray(profile.currentTreatments),
    conditions: parseJsonArray(profile.conditions),
    mission: profile.mission,
    physicians: profile.assignments.map(item => ({
      id: item.doctor.id,
      name: `${item.doctor.firstName} ${item.doctor.lastName}`
    }))
  };
}

export function operationalView(profile: Awaited<ReturnType<typeof getProfileOrThrow>>, alertSummary: unknown) {
  return {
    id: profile.id,
    callSign: profile.callSign,
    agency: profile.agency,
    fictitious: true,
    missionDay: profile.missionDay,
    mission: profile.mission
      ? {
          name: profile.mission.name,
          code: profile.mission.code,
          status: profile.mission.status,
          environment: profile.mission.environment
        }
      : null,
    alertSummary,
    note: 'Operational view. Medical history, allergies, treatments, and sex are not included for this role.'
  };
}

export async function visibleAstronautIds(user: AuthPayload): Promise<string[] | 'all-operational' | 'all-admin'> {
  if (user.role === Role.ASTRONAUT) {
    const own = await prisma.astronautProfile.findUnique({ where: { userId: user.userId } });
    return own ? [own.id] : [];
  }
  if (user.role === Role.DOCTOR) {
    const rows = await prisma.doctorAssignment.findMany({
      where: { doctorId: user.userId, active: true },
      select: { astronautId: true }
    });
    return rows.map(row => row.astronautId);
  }
  if (user.role === Role.GROUND_CREW) return 'all-operational';
  if (user.role === Role.ADMIN) return 'all-admin';
  return [];
}
