import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNutritionPlan, type NutritionInput } from '../src/nutrition/nutrition.engine.ts';
import { DEMO_FOODS } from '../src/nutrition/menu.data.ts';
import { assessSeries } from '../src/alerts/alert.rules.ts';

function base(overrides: Partial<NutritionInput>): NutritionInput {
  return {
    astronautId: 'a',
    callSign: 'TEST',
    age: 40,
    heightCm: 170,
    weightKg: 70,
    sex: 'F',
    allergies: [],
    intolerances: [],
    preferences: [],
    conditions: [],
    weightHistory: [],
    sleepHours: 7.5,
    fatigue: 2,
    activityMin: 100,
    boneChangePct: -0.1,
    muscleScore: 90,
    glucoseMgDl: 90,
    intakeDays: [{
      date: '2026-11-01', kcal: 2400, proteinG: 110, carbsG: 250, fatG: 70,
      calciumMg: 900, vitaminDIu: 200, ironMg: 12, folateUg: 300, magnesiumMg: 320, hydrationMl: 2600
    }],
    menu: DEMO_FOODS,
    missionDay: 100,
    ...overrides
  };
}

test('missing anthropometrics do not invent an energy number', () => {
  const plan = buildNutritionPlan(base({ age: null, sex: null }));
  assert.equal(plan.energy.estimatedDailyKcal, null);
  assert.ok(plan.missingData.includes('age'));
  assert.equal(plan.dataQuality, 'INSUFFICIENT');
});

test('peanut allergy removes peanut butter and lactose removes dairy', () => {
  const peanut = buildNutritionPlan(base({ allergies: ['peanut'], preferences: [] }));
  const dairy = buildNutritionPlan(base({ intolerances: ['lactose'] }));
  const codes = (plan: ReturnType<typeof buildNutritionPlan>) =>
    (plan.mealPlan ?? []).flatMap(slot => slot.items.map(item => item.code));
  assert.ok(!codes(peanut).includes('peanut-butter'));
  assert.ok(peanut.excludedFoods.some(name => name.toLowerCase().includes('peanut')));
  assert.ok(!codes(dairy).includes('yogurt'));
  assert.ok(!codes(dairy).includes('mac-cheese'));
});

test('two different profiles do not get the same meal plan', () => {
  const healthy = buildNutritionPlan(base({
    callSign: 'CDR. Vance',
    weightKg: 68,
    preferences: ['salmon'],
    activityMin: 110
  }));
  const bone = buildNutritionPlan(base({
    callSign: 'MS-2. Tremblay',
    sex: 'M',
    weightKg: 79,
    heightCm: 181,
    age: 39,
    intolerances: ['lactose'],
    boneChangePct: -1.3,
    activityMin: 50,
    preferences: []
  }));
  assert.notEqual(healthy.energy.estimatedDailyKcal, bone.energy.estimatedDailyKcal);
  const left = JSON.stringify(healthy.mealPlan);
  const right = JSON.stringify(bone.mealPlan);
  assert.notEqual(left, right);
  assert.ok(bone.priorities.some(line => line.toLowerCase().includes('bone')));
});

test('critical oxygen rule does not wait on a narrative', () => {
  const draft = assessSeries('SPO2', [{ value: 88, measuredAt: new Date() }], '%');
  assert.equal(draft?.severity, 'CRITICAL');
  assert.match(draft?.description ?? '', /Escalate now/);
});
