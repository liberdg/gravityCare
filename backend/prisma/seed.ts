import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { DEMO_FOODS } from '../src/nutrition/menu.data.js';
import { syncMeasurementAlerts } from '../src/alerts/alert.service.js';

dotenv.config();

const prisma = new PrismaClient();

function at(daysAgo: number, hour = 12): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo, hour, 0, 0));
}

async function main() {
  console.log('Seeding fictional GravityCare demo data...');

  await prisma.syncOperation.deleteMany();
  await prisma.healthReport.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.message.deleteMany();
  await prisma.symptomReport.deleteMany();
  await prisma.medicalNote.deleteMany();
  await prisma.nutritionPlan.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.nutritionLog.deleteMany();
  await prisma.vitalMeasurement.deleteMany();
  await prisma.doctorAssignment.deleteMany();
  await prisma.missionMenuItem.deleteMany();
  await prisma.foodItem.deleteMany();
  await prisma.astronautProfile.deleteMany();
  await prisma.mission.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('demo1234', 10);

  const mission = await prisma.mission.create({
    data: {
      name: 'Artemis-IV / Gateway',
      code: 'ARTEMIS-IV',
      startDate: new Date('2026-06-15T00:00:00Z'),
      status: 'ACTIVE',
      environment: 'MICROGRAVITY',
      waterBudgetMlPerCrewPerDay: 2500,
      notes: 'Fictional demonstration mission. No real crew data.'
    }
  });

  for (const food of DEMO_FOODS) {
    const row = await prisma.foodItem.create({
      data: {
        ...food,
        allergens: JSON.stringify(food.allergens),
        tags: JSON.stringify(food.tags),
        demoEstimate: true
      }
    });
    await prisma.missionMenuItem.create({
      data: { missionId: mission.id, foodId: row.id, available: true }
    });
  }

  async function crew(input: {
    email: string;
    firstName: string;
    lastName: string;
    callSign: string;
    agency: string;
    bloodType: string;
    age: number;
    heightCm: number;
    weightKg: number;
    sex: string;
    flightHours: number;
    baselineHrv: number;
    missionDay: number;
    allergies: string[];
    intolerances: string[];
    preferences: string[];
    conditions: string[];
    demoScenario: string;
  }) {
    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: 'ASTRONAUT',
        astronautProfile: {
          create: {
            missionId: mission.id,
            callSign: input.callSign,
            agency: input.agency,
            bloodType: input.bloodType,
            age: input.age,
            heightCm: input.heightCm,
            weightKg: input.weightKg,
            sex: input.sex,
            flightHours: input.flightHours,
            missionDay: input.missionDay,
            baselineHrv: input.baselineHrv,
            allergies: JSON.stringify(input.allergies),
            intolerances: JSON.stringify(input.intolerances),
            preferences: JSON.stringify(input.preferences),
            conditions: JSON.stringify(input.conditions),
            medicalHistory: JSON.stringify([]),
            currentTreatments: JSON.stringify([]),
            demoScenario: input.demoScenario,
            fictitious: true
          }
        }
      },
      include: { astronautProfile: true }
    });
  }

  const vance = await crew({
    email: 'k.vance@nasa.gov', firstName: 'Kathryn', lastName: 'Vance', callSign: 'CDR. Vance', agency: 'NASA',
    bloodType: 'O+', age: 41, heightCm: 172, weightKg: 68, sex: 'F', flightHours: 4210, baselineHrv: 64,
    missionDay: 142, allergies: [], intolerances: [], preferences: ['salmon'], conditions: [], demoScenario: 'healthy'
  });
  const chen = await crew({
    email: 'm.chen@nasa.gov', firstName: 'Marcus', lastName: 'Chen', callSign: 'PLT. Chen', agency: 'NASA',
    bloodType: 'A-', age: 36, heightCm: 178, weightKg: 74, sex: 'M', flightHours: 2890, baselineHrv: 58,
    missionDay: 142, allergies: ['peanut'], intolerances: [], preferences: [], conditions: [], demoScenario: 'weight-loss'
  });
  const diallo = await crew({
    email: 'a.diallo@nasa.gov', firstName: 'Amina', lastName: 'Diallo', callSign: 'Dr. Diallo', agency: 'NASA',
    bloodType: 'B+', age: 38, heightCm: 168, weightKg: 62, sex: 'F', flightHours: 1940, baselineHrv: 71,
    missionDay: 142, allergies: [], intolerances: [], preferences: ['oatmeal'], conditions: [], demoScenario: 'sleep-fatigue'
  });
  const tremblay = await crew({
    email: 'l.tremblay@asc-csa.gc.ca', firstName: 'Luc', lastName: 'Tremblay', callSign: 'MS-2. Tremblay', agency: 'CSA / ASC',
    bloodType: 'O-', age: 39, heightCm: 181, weightKg: 79, sex: 'M', flightHours: 2450, baselineHrv: 51,
    missionDay: 142, allergies: [], intolerances: ['lactose'], preferences: [], conditions: [], demoScenario: 'bone'
  });

  const doctor = await prisma.user.create({
    data: { email: 'flight.surgeon@nasa.gov', passwordHash, firstName: 'Elena', lastName: 'Martinez', role: 'DOCTOR' }
  });
  await prisma.user.create({
    data: { email: 'admin@gravitycare.space', passwordHash, firstName: 'System', lastName: 'Admin', role: 'ADMIN' }
  });
  await prisma.user.create({
    data: { email: 'ground.ops@nasa.gov', passwordHash, firstName: 'James', lastName: 'Okello', role: 'GROUND_CREW' }
  });

  for (const member of [vance, chen, diallo, tremblay]) {
    await prisma.doctorAssignment.create({
      data: { doctorId: doctor.id, astronautId: member.astronautProfile!.id, active: true }
    });
  }

  async function vital(astronautId: string, type: string, value: number, unit: string, daysAgo: number) {
    await prisma.vitalMeasurement.create({
      data: { astronautId, type, value, unit, measuredAt: at(daysAgo), source: 'SIMULATED', notes: 'Fictional demo value' }
    });
  }

  async function dayLog(astronautId: string, daysAgo: number, meals: Array<{ meal: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'; codes: string[]; water?: number }>) {
    for (const meal of meals) {
      const items = meal.codes.map(code => {
        const food = DEMO_FOODS.find(item => item.code === code)!;
        return { foodCode: code, name: food.nameEn, portions: 1, kcal: food.kcal, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG };
      });
      await prisma.nutritionLog.create({
        data: {
          astronautId,
          date: at(daysAgo, meal.meal === 'BREAKFAST' ? 8 : meal.meal === 'LUNCH' ? 13 : meal.meal === 'DINNER' ? 19 : 16),
          mealType: meal.meal,
          items: JSON.stringify(items),
          estimatedKcal: items.reduce((s, i) => s + i.kcal, 0),
          proteinG: items.reduce((s, i) => s + i.proteinG, 0),
          carbsG: items.reduce((s, i) => s + i.carbsG, 0),
          fatG: items.reduce((s, i) => s + i.fatG, 0),
          hydrationMl: meal.water ?? null,
          notes: 'Fictional intake log'
        }
      });
    }
  }

  const vanceId = vance.astronautProfile!.id;
  const chenId = chen.astronautProfile!.id;
  const dialloId = diallo.astronautProfile!.id;
  const tremblayId = tremblay.astronautProfile!.id;

  for (const daysAgo of [6, 5, 4, 3, 2, 1, 0]) {
    await vital(vanceId, 'HR', 68, 'BPM', daysAgo);
    await vital(vanceId, 'SPO2', 98, '%', daysAgo);
    await vital(vanceId, 'TEMP', 36.8, 'C', daysAgo);
    await vital(vanceId, 'SLEEP_HOURS', 7.4, 'h', daysAgo);
    await vital(vanceId, 'ACTIVITY_MIN', 110, 'min', daysAgo);
    await vital(vanceId, 'FATIGUE', 2, 'score', daysAgo);
    await vital(vanceId, 'WEIGHT', 68 + (daysAgo % 2) * 0.1, 'kg', daysAgo);
    await dayLog(vanceId, daysAgo, [
      { meal: 'BREAKFAST', codes: ['oatmeal', 'scrambled-eggs', 'calcium-beverage'], water: 700 },
      { meal: 'LUNCH', codes: ['grilled-chicken', 'grilled-chicken', 'tortilla', 'rice-beans'], water: 700 },
      { meal: 'DINNER', codes: ['salmon', 'beef-stew', 'quinoa-veg'], water: 700 },
      { meal: 'SNACK', codes: ['almonds', 'fruit-cocktail'], water: 500 }
    ]);
  }
  await vital(vanceId, 'BONE_CHANGE_PCT', -0.1, '%', 0);
  await vital(vanceId, 'MUSCLE_SCORE', 90, 'score', 0);
  await vital(vanceId, 'GLUCOSE', 92, 'mg/dL', 0);

  const chenWeights = [74, 73.2, 72.4, 71.6, 70.8, 70.1, 69.5];
  for (let i = 0; i < 7; i++) {
    const daysAgo = 18 - i * 3;
    await vital(chenId, 'WEIGHT', chenWeights[i], 'kg', daysAgo);
    await vital(chenId, 'ACTIVITY_MIN', 35, 'min', daysAgo);
    await vital(chenId, 'SLEEP_HOURS', 6.8, 'h', daysAgo);
    await vital(chenId, 'FATIGUE', 7, 'score', daysAgo);
    await vital(chenId, 'HR', 74, 'BPM', daysAgo);
    await vital(chenId, 'SPO2', 98, '%', daysAgo);
    await dayLog(chenId, daysAgo, [
      { meal: 'BREAKFAST', codes: ['oatmeal'], water: 400 },
      { meal: 'LUNCH', codes: ['tortilla', 'grilled-chicken'], water: 400 },
      { meal: 'DINNER', codes: ['rice-beans'], water: 350 },
      { meal: 'SNACK', codes: ['fruit-cocktail'], water: 250 }
    ]);
  }
  await vital(chenId, 'BONE_CHANGE_PCT', -0.4, '%', 0);
  await vital(chenId, 'MUSCLE_SCORE', 66, 'score', 0);
  await vital(chenId, 'GLUCOSE', 96, 'mg/dL', 0);

  for (const daysAgo of [4, 3, 2, 1, 0]) {
    await vital(dialloId, 'SLEEP_HOURS', daysAgo === 0 ? 4.8 : 5.4, 'h', daysAgo);
    await vital(dialloId, 'FATIGUE', 8, 'score', daysAgo);
    await vital(dialloId, 'ACTIVITY_MIN', 40, 'min', daysAgo);
    await vital(dialloId, 'HR', 66, 'BPM', daysAgo);
    await vital(dialloId, 'SPO2', 99, '%', daysAgo);
    await vital(dialloId, 'WEIGHT', 62, 'kg', daysAgo);
    await dayLog(dialloId, daysAgo, [
      { meal: 'BREAKFAST', codes: ['oatmeal', 'scrambled-eggs'], water: 400 },
      { meal: 'LUNCH', codes: ['grilled-chicken', 'tortilla'], water: 400 },
      { meal: 'DINNER', codes: ['salmon', 'rice-beans'], water: 400 },
      { meal: 'SNACK', codes: ['yogurt'], water: 300 }
    ]);
  }
  await vital(dialloId, 'BONE_CHANGE_PCT', -0.2, '%', 0);
  await vital(dialloId, 'MUSCLE_SCORE', 88, 'score', 0);

  for (const daysAgo of [6, 3, 0]) {
    await vital(tremblayId, 'BONE_CHANGE_PCT', -1.3, '%', daysAgo);
    await vital(tremblayId, 'ACTIVITY_MIN', 50, 'min', daysAgo);
    await vital(tremblayId, 'SLEEP_HOURS', 6.4, 'h', daysAgo);
    await vital(tremblayId, 'FATIGUE', 4, 'score', daysAgo);
    await vital(tremblayId, 'HR', 75, 'BPM', daysAgo);
    await vital(tremblayId, 'SPO2', 97, '%', daysAgo);
    await vital(tremblayId, 'WEIGHT', 79, 'kg', daysAgo);
    await vital(tremblayId, 'MUSCLE_SCORE', 80, 'score', daysAgo);
    await dayLog(tremblayId, daysAgo, [
      { meal: 'BREAKFAST', codes: ['oatmeal', 'scrambled-eggs'], water: 600 },
      { meal: 'LUNCH', codes: ['grilled-chicken', 'rice-beans'], water: 600 },
      { meal: 'DINNER', codes: ['beef-stew', 'quinoa-veg'], water: 500 },
      { meal: 'SNACK', codes: ['almonds', 'fruit-cocktail'], water: 400 }
    ]);
  }

  await prisma.symptomReport.create({
    data: { astronautId: dialloId, content: 'Fictional report: woke tired, no chest pain.', tags: '[]' }
  });
  await prisma.message.create({
    data: {
      senderId: doctor.id,
      receiverId: diallo.id,
      content: 'SIMULATED Earth link: please log sleep and fluid for two more days. This message is a demonstration, not a live space-to-ground transmission.',
      simulated: true
    }
  });

  for (const id of [vanceId, chenId, dialloId, tremblayId]) {
    await syncMeasurementAlerts(id);
  }

  console.log('Seed completed. Password for every account: demo1234');
  console.log('All profiles and measurements are fictional.');
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
