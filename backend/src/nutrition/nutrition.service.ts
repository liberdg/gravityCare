import { prisma } from '../common/prisma.js';
import { parseJsonArray, parseJsonValue } from '../common/json.js';
import { DEMO_FOODS, type DemoFood } from './menu.data.js';
import { buildNutritionPlan, type IntakeDay, type NutritionInput } from './nutrition.engine.js';

interface LogItem {
  foodCode?: string;
  portions?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function latestValue(vitals: Array<{ type: string; value: number; measuredAt: Date }>, type: string): number | null {
  const found = vitals.find(v => v.type === type);
  return found ? found.value : null;
}

export async function loadMenu(missionId: string | null): Promise<DemoFood[]> {
  if (!missionId) return [];
  const rows = await prisma.missionMenuItem.findMany({
    where: { missionId, available: true },
    include: { food: true }
  });
  if (rows.length === 0) return [];
  return rows.map(row => ({
    code: row.food.code,
    nameEn: row.food.nameEn,
    nameFr: row.food.nameFr,
    kcal: row.food.kcal,
    proteinG: row.food.proteinG,
    carbsG: row.food.carbsG,
    fatG: row.food.fatG,
    calciumMg: row.food.calciumMg,
    vitaminDIu: row.food.vitaminDIu,
    ironMg: row.food.ironMg,
    vitaminB12Ug: row.food.vitaminB12Ug,
    folateUg: row.food.folateUg,
    magnesiumMg: row.food.magnesiumMg,
    waterMl: row.food.waterMl,
    allergens: parseJsonArray(row.food.allergens),
    tags: parseJsonArray(row.food.tags),
    prep: row.food.prep as DemoFood['prep'],
    portionLabel: row.food.portionLabel
  }));
}

export async function recommendationFor(astronautId: string, lang: 'en' | 'fr' = 'en') {
  const profile = await prisma.astronautProfile.findUnique({
    where: { id: astronautId },
    include: {
      vitals: { orderBy: { measuredAt: 'desc' }, take: 80 },
      nutritionLogs: { orderBy: { date: 'desc' }, take: 40 }
    }
  });
  if (!profile) return null;

  const menu = await loadMenu(profile.missionId);
  const byCode = new Map(menu.map(food => [food.code, food]));
  const days = new Map<string, IntakeDay>();

  for (const log of profile.nutritionLogs) {
    const key = dayKey(log.date);
    const day = days.get(key) ?? {
      date: key, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0,
      calciumMg: 0, vitaminDIu: 0, ironMg: 0, folateUg: 0, magnesiumMg: 0, hydrationMl: 0
    };
    day.kcal += log.estimatedKcal ?? 0;
    day.proteinG += log.proteinG ?? 0;
    day.carbsG += log.carbsG ?? 0;
    day.fatG += log.fatG ?? 0;
    day.hydrationMl += log.hydrationMl ?? 0;
    const items = parseJsonValue<LogItem[]>(log.items, []);
    for (const item of items) {
      const food = item.foodCode ? byCode.get(item.foodCode) ?? DEMO_FOODS.find(f => f.code === item.foodCode) : undefined;
      const portions = item.portions ?? 1;
      if (!food) continue;
      day.calciumMg += food.calciumMg * portions;
      day.vitaminDIu += food.vitaminDIu * portions;
      day.ironMg += food.ironMg * portions;
      day.folateUg += food.folateUg * portions;
      day.magnesiumMg += food.magnesiumMg * portions;
    }
    days.set(key, day);
  }

  const weightHistory = profile.vitals
    .filter(v => v.type === 'WEIGHT')
    .map(v => ({ measuredAt: v.measuredAt.toISOString(), value: v.value }));

  const input: NutritionInput = {
    astronautId: profile.id,
    callSign: profile.callSign,
    age: profile.age,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    sex: profile.sex,
    allergies: parseJsonArray(profile.allergies),
    intolerances: parseJsonArray(profile.intolerances),
    preferences: parseJsonArray(profile.preferences),
    conditions: parseJsonArray(profile.conditions),
    weightHistory,
    sleepHours: latestValue(profile.vitals, 'SLEEP_HOURS'),
    fatigue: latestValue(profile.vitals, 'FATIGUE'),
    activityMin: latestValue(profile.vitals, 'ACTIVITY_MIN'),
    boneChangePct: latestValue(profile.vitals, 'BONE_CHANGE_PCT'),
    muscleScore: latestValue(profile.vitals, 'MUSCLE_SCORE'),
    glucoseMgDl: latestValue(profile.vitals, 'GLUCOSE'),
    intakeDays: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    menu,
    missionDay: profile.missionDay,
    lang
  };

  const recommendation = buildNutritionPlan(input);
  const review = await prisma.nutritionPlan.findFirst({
    where: { astronautId },
    orderBy: { createdAt: 'desc' },
    include: { reviewer: { select: { firstName: true, lastName: true, role: true } } }
  });

  return {
    recommendation,
    review: review
      ? {
          id: review.id,
          status: review.status,
          reviewNote: review.reviewNote,
          reviewedAt: review.reviewedAt,
          reviewer: review.reviewer
        }
      : { id: null, status: 'DRAFT', reviewNote: null, reviewedAt: null, reviewer: null },
    series: input.intakeDays
  };
}
