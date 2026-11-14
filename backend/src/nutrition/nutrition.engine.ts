/**
 * Personalized space-nutrition planner.
 *
 * Energy uses the terrestrial Mifflin–St Jeor equation (Mifflin et al., 1990)
 * times a prototype activity factor. That factor is NOT a NASA flight rule.
 * Protein targets are prototype planning factors for the demo, not prescriptions.
 * Missing inputs stay missing. This module never fills them with a default body.
 */

import { FOOD_ESTIMATE_NOTE, type DemoFood } from './menu.data.js';

export interface IntakeDay {
  date: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  calciumMg: number;
  vitaminDIu: number;
  ironMg: number;
  folateUg: number;
  magnesiumMg: number;
  hydrationMl: number;
}

export interface WeightPoint {
  measuredAt: string;
  value: number;
}

export interface NutritionInput {
  astronautId: string;
  callSign: string;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  sex: string | null;
  allergies: string[];
  intolerances: string[];
  preferences: string[];
  conditions: string[];
  weightHistory: WeightPoint[];
  sleepHours: number | null;
  fatigue: number | null;
  activityMin: number | null;
  boneChangePct: number | null;
  muscleScore: number | null;
  glucoseMgDl: number | null;
  intakeDays: IntakeDay[];
  menu: DemoFood[];
  missionDay: number | null;
  lang?: 'en' | 'fr';
}

export interface MealItem {
  code: string;
  nameEn: string;
  nameFr: string;
  portions: number;
  portionLabel: string;
  prep: string;
  kcal: number;
  proteinG: number;
  reason: string;
}

export interface NutritionRecommendation {
  astronautId: string;
  callSign: string;
  generatedAt: string;
  dataQuality: 'SUFFICIENT' | 'INSUFFICIENT';
  missingData: string[];
  observations: string[];
  energy: {
    estimatedDailyKcal: number | null;
    method: string;
    note: string;
  };
  macros: {
    proteinG: { target: number | null; rationale: string };
    carbsG: { target: number | null; rationale: string };
    fatG: { target: number | null; rationale: string };
  };
  micronutrients: Array<{
    name: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    observed: string;
  }>;
  hydration: {
    targetMl: number | null;
    observedAverageMl: number | null;
    rationale: string;
  };
  mealPlan: Array<{ slot: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'; items: MealItem[] }> | null;
  excludedFoods: string[];
  priorities: string[];
  warnings: string[];
  nutrientsToWatch: string[];
  shortTermGoals: string[];
  followUp: string[];
  medicalValidationRequired: true;
  disclaimer: string;
  sources: Array<{ title: string; note: string }>;
  foodDataNote: string;
}

const SOURCE_MIFFLIN = {
  title: 'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr. 1990;51:241-247.',
  note: 'Terrestrial resting-energy equation. Used here only as a labeled estimate, not as a spaceflight standard.'
};

const SOURCE_NASA_NUTRITION = {
  title: 'Smith SM, Zwart SR, Heer M. Human Adaptation to Spaceflight: The Role of Nutrition. NASA.',
  note: 'NASA Nutritional Biochemistry Laboratory synthesis of in-flight nutrition, bone, muscle, and related risks. Numeric targets in this prototype are planning factors and still need flight-surgeon validation.'
};

const SOURCE_HRP = {
  title: 'NASA Human Research Program. Five hazards of human spaceflight (radiation, isolation, distance, gravity, hostile/closed environment).',
  note: 'Frames why bone, muscle, nutrition, and radiation are monitored together. It does not by itself set a personal diet.'
};

function round(n: number): number {
  return Math.round(n);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

function isMale(sex: string | null): boolean | null {
  if (!sex) return null;
  const s = sex.toUpperCase();
  if (s.startsWith('M')) return true;
  if (s.startsWith('F')) return false;
  return null;
}

function blocksFood(food: DemoFood, allergies: string[], intolerances: string[]): boolean {
  const blocked = new Set([...allergies, ...intolerances].map(v => v.toLowerCase().trim()));
  if (blocked.size === 0) return false;
  for (const allergen of food.allergens) {
    const a = allergen.toLowerCase();
    if (blocked.has(a)) return true;
    if (a === 'milk' && (blocked.has('lactose') || blocked.has('dairy') || blocked.has('milk'))) return true;
    if (a === 'peanut' && (blocked.has('peanut') || blocked.has('peanuts') || blocked.has('arachide'))) return true;
    if (a === 'tree-nut' && (blocked.has('tree-nut') || blocked.has('nuts') || blocked.has('nut'))) return true;
    if (a === 'gluten' && blocked.has('gluten')) return true;
    if (a === 'fish' && blocked.has('fish')) return true;
    if (a === 'egg' && (blocked.has('egg') || blocked.has('eggs'))) return true;
  }
  return false;
}

function weightTrend(history: WeightPoint[]): { deltaKg: number; days: number } | null {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => +new Date(a.measuredAt) - +new Date(b.measuredAt));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = Math.max(1, Math.round((+new Date(last.measuredAt) - +new Date(first.measuredAt)) / 86400000));
  return { deltaKg: Number((last.value - first.value).toFixed(2)), days };
}

function scoreFood(food: DemoFood, focus: Set<string>, preferences: string[]): number {
  let score = 1;
  if (focus.has('protein')) score += food.proteinG * 3;
  if (focus.has('energy')) score += food.kcal / 15;
  if (focus.has('bone')) score += food.calciumMg / 15 + food.vitaminDIu / 25;
  if (focus.has('hydration')) score += food.waterMl / 40;
  if (focus.has('fatigue') || focus.has('sleep')) score += food.magnesiumMg / 12 + food.ironMg * 4 + food.folateUg / 25;
  const pref = preferences.map(p => p.toLowerCase());
  if (pref.some(p => food.tags.includes(p) || food.code.includes(p) || food.nameEn.toLowerCase().includes(p))) {
    score += 25;
  }
  return score;
}

function pickMeals(menu: DemoFood[], focus: Set<string>, preferences: string[], lang?: 'en' | 'fr'): NutritionRecommendation['mealPlan'] {
  const tx = (en: string, frText: string) => (lang === 'fr' ? frText : en);
  const slots: Array<'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'> = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];
  const used = new Set<string>();
  const plan: NonNullable<NutritionRecommendation['mealPlan']> = [];

  for (const slot of slots) {
    const ranked = menu
      .filter(food => !used.has(food.code))
      .filter(food => slot !== 'BREAKFAST' || food.tags.includes('breakfast') || food.kcal < 280)
      .sort((a, b) => scoreFood(b, focus, preferences) - scoreFood(a, focus, preferences));
    const choice = ranked[0] ?? menu.find(food => !used.has(food.code));
    if (!choice) {
      plan.push({ slot, items: [] });
      continue;
    }
    used.add(choice.code);
    const reasons: string[] = [];
    if (focus.has('protein') && choice.proteinG >= 12) reasons.push(tx('higher protein on this menu', 'protéines plus élevées dans ce menu'));
    if (focus.has('bone') && (choice.calciumMg >= 100 || choice.vitaminDIu >= 80)) reasons.push(tx('calcium or vitamin D contribution', 'apport de calcium ou de vitamine D'));
    if (focus.has('energy') && choice.kcal >= 240) reasons.push(tx('energy-dense item currently on board', 'aliment dense en énergie, présent à bord'));
    if (focus.has('hydration') && choice.waterMl >= 80) reasons.push(tx('contributes fluid', 'contribue à l’hydratation'));
    if (reasons.length === 0) reasons.push(tx('available on the current menu and compatible with recorded restrictions', 'disponible au menu et compatible avec les restrictions enregistrées'));
    plan.push({
      slot,
      items: [{
        code: choice.code,
        nameEn: choice.nameEn,
        nameFr: choice.nameFr,
        portions: 1,
        portionLabel: choice.portionLabel,
        prep: choice.prep,
        kcal: choice.kcal,
        proteinG: choice.proteinG,
        reason: reasons.join('; ')
      }]
    });
  }
  return plan;
}

export function buildNutritionPlan(input: NutritionInput): NutritionRecommendation {
  const fr = input.lang === 'fr';
  const tx = (en: string, frText: string) => (fr ? frText : en);
  const missing: string[] = [];
  if (input.age == null) missing.push('age');
  if (input.heightCm == null) missing.push('height');
  if (input.weightKg == null) missing.push('weight');
  if (isMale(input.sex) == null) missing.push('biological_sex');
  if (input.activityMin == null) missing.push('activity_minutes');
  if (input.intakeDays.length === 0) missing.push('food_intake');
  if (input.menu.length === 0) missing.push('onboard_menu');
  if (input.sleepHours == null) missing.push('sleep');
  if (input.boneChangePct == null) missing.push('bone_measure');

  const male = isMale(input.sex);
  let kcal: number | null = null;
  let method = tx('Not estimated', 'Non estimé');
  if (input.weightKg != null && input.heightCm != null && input.age != null && male != null && input.activityMin != null) {
    const bmr = male
      ? 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + 5
      : 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age - 161;
    const factor = input.activityMin >= 100 ? 1.7 : input.activityMin >= 60 ? 1.55 : 1.4;
    kcal = round(bmr * factor);
    method = tx(
      `Mifflin–St Jeor × ${factor} (prototype activity factor from recorded activity of ${input.activityMin} min)`,
      `Mifflin–St Jeor × ${factor} (facteur d’activité prototype, activité enregistrée : ${input.activityMin} min)`
    );
  } else {
    method = tx(
      'Withheld: age, height, weight, biological sex, and activity are all required before an energy figure is shown',
      'Non estimé : l’âge, la taille, la masse, le sexe biologique et l’activité sont tous requis avant d’afficher un chiffre'
    );
  }

  const trend = weightTrend(input.weightHistory);
  const avgKcal = mean(input.intakeDays.map(d => d.kcal));
  const avgProtein = mean(input.intakeDays.map(d => d.proteinG));
  const avgWater = mean(input.intakeDays.map(d => d.hydrationMl));
  const avgCalcium = mean(input.intakeDays.map(d => d.calciumMg));
  const avgVitaminD = mean(input.intakeDays.map(d => d.vitaminDIu));
  const avgIron = mean(input.intakeDays.map(d => d.ironMg));
  const avgFolate = mean(input.intakeDays.map(d => d.folateUg));
  const avgMag = mean(input.intakeDays.map(d => d.magnesiumMg));

  const focus = new Set<string>();
  const priorities: string[] = [];
  const warnings: string[] = [];
  const goals: string[] = [];
  const followUp: string[] = [];
  const observations: string[] = [];

  let proteinPerKg = 1.2;
  if (trend && trend.deltaKg <= -1.5) {
    proteinPerKg = 1.5;
    focus.add('protein');
    focus.add('energy');
    warnings.push(tx(
      `Recorded weight change is ${trend.deltaKg} kg over about ${trend.days} days. Compare this with intake and activity before treating it as fluid loss or muscle loss.`,
      `Variation de masse enregistrée : ${trend.deltaKg} kg sur environ ${trend.days} jours. Comparez avec les apports et l’activité avant d’y voir une perte hydrique ou musculaire.`
    ));
    priorities.push(tx(
      'Recorded weight is down. Raise energy and protein only within foods that are actually on board, and ask the flight surgeon to review the trend.',
      'La masse enregistrée baisse. Augmentez l’énergie et les protéines uniquement avec les aliments réellement à bord, et faites relire la tendance par le médecin.'
    ));
    followUp.push(tx('Repeat body mass on the same scale protocol and log each meal for the next 3 days.', 'Reprendre la masse avec le même protocole de balance et consigner chaque repas pendant 3 jours.'));
  }
  if (input.muscleScore != null && input.muscleScore < 70) {
    proteinPerKg = Math.max(proteinPerKg, 1.5);
    focus.add('protein');
    priorities.push(tx(
      'Muscle score is below the crewmember’s own recorded range used by this prototype. Protein foods on the menu are prioritized. Exercise countermeasures stay essential.',
      'L’indice musculaire est sous la plage enregistrée pour cette personne dans ce prototype. Les aliments protéiques du menu sont prioritaires. L’exercice de contre-mesure reste indispensable.'
    ));
  }
  if (input.activityMin != null && input.activityMin < 60) {
    observations.push(tx(
      `Resistive / physical activity is recorded at ${input.activityMin} min. Nutrition does not replace the exercise countermeasure.`,
      `Activité physique enregistrée : ${input.activityMin} min. L’alimentation ne remplace pas la contre-mesure par l’exercice.`
    ));
  }
  if (avgKcal != null && kcal != null && avgKcal < kcal * 0.85) {
    focus.add('energy');
    warnings.push(tx(
      `Mean recorded intake (${round(avgKcal)} kcal/day) is below 85% of the estimated need (${kcal} kcal). This is an estimate-versus-log comparison, not a measured energy deficit.`,
      `Apport moyen enregistré (${round(avgKcal)} kcal/j) sous 85 % du besoin estimé (${kcal} kcal). Comparaison journal / estimation, pas un déficit mesuré.`
    ));
    priorities.push(tx('Close the gap between logged intake and the estimated energy need using the current menu.', 'Rapprocher le journal alimentaire du besoin énergétique estimé, avec le menu actuel.'));
  }
  if (input.boneChangePct != null && input.boneChangePct <= -0.5) {
    focus.add('bone');
    priorities.push(tx(
      'Bone measure is below the prototype watch level. Favor calcium- and vitamin D–containing foods that are on the menu. Nutrition alone does not treat bone loss; resistive exercise and medical review remain necessary.',
      'La mesure osseuse est sous le seuil de suivi du prototype. Privilégier les aliments du menu qui apportent calcium et vitamine D. L’alimentation seule ne traite pas la perte osseuse ; l’exercice résistif et la revue médicale restent nécessaires.'
    ));
    followUp.push(tx('Flight surgeon review of bone measure, calcium intake, vitamin D intake, and resistive exercise.', 'Revue médicale de la mesure osseuse, du calcium, de la vitamine D et de l’exercice résistif.'));
  }
  if (input.sleepHours != null && input.sleepHours < 6.5) {
    focus.add('sleep');
    priorities.push(tx(
      'Sleep is shorter than 6.5 h on the latest record. Keep the last meal lighter when the timeline allows. Do not treat food as the cause of the short sleep.',
      'Le dernier sommeil enregistré est sous 6,5 h. Alléger le dernier repas si le planning le permet. Ne pas attribuer ce sommeil court à l’alimentation.'
    ));
    observations.push(tx('Short sleep and fatigue can coincide with low intake. The link is a hypothesis, not a diagnosis.', 'Un sommeil court et la fatigue peuvent coïncider avec des apports bas. Le lien est une hypothèse, pas un diagnostic.'));
  }
  if (input.fatigue != null && input.fatigue >= 6) {
    focus.add('fatigue');
    observations.push(tx(
      `Fatigue is recorded at ${input.fatigue}/10. Iron, folate, magnesium, energy, and hydration are checked because they can contribute. They are not assumed to be the cause.`,
      `Fatigue enregistrée : ${input.fatigue}/10. Fer, folates, magnésium, énergie et hydratation sont examinés parce qu’ils peuvent contribuer. Ils ne sont pas présumés en être la cause.`
    ));
  }
  if (input.glucoseMgDl != null && (input.glucoseMgDl < 70 || input.glucoseMgDl > 180)) {
    warnings.push(tx(
      `Glucose ${input.glucoseMgDl} mg/dL is outside the prototype watch band. This is not a diagnosis. Repeat the measurement and notify the flight surgeon.`,
      `Glucose ${input.glucoseMgDl} mg/dL hors de la bande de suivi du prototype. Ce n’est pas un diagnostic. Répéter la mesure et prévenir le médecin.`
    ));
    followUp.push(tx('Repeat glucose and do not change medication from this screen.', 'Répéter la glycémie. Ne pas modifier un traitement depuis cet écran.'));
  }

  const proteinTarget = input.weightKg != null ? round(input.weightKg * proteinPerKg) : null;
  if (avgProtein != null && proteinTarget != null && avgProtein < proteinTarget * 0.8) {
    focus.add('protein');
    priorities.push(tx(
      `Logged protein (about ${round(avgProtein)} g/day) is under 80% of the planning target (${proteinTarget} g).`,
      `Protéines consignées (environ ${round(avgProtein)} g/j) sous 80 % de la cible de planification (${proteinTarget} g).`
    ));
  }

  let fatTarget: number | null = null;
  let carbTarget: number | null = null;
  if (kcal != null && proteinTarget != null) {
    fatTarget = round((kcal * 0.28) / 9);
    carbTarget = round((kcal - proteinTarget * 4 - fatTarget * 9) / 4);
  }

  let hydrationTarget: number | null = null;
  if (input.weightKg != null) {
    hydrationTarget = round(input.weightKg * 35);
    if (input.activityMin != null && input.activityMin >= 100) hydrationTarget += 400;
  } else {
    missing.push('weight_for_hydration');
  }
  if (avgWater != null && hydrationTarget != null && avgWater < hydrationTarget * 0.8) {
    focus.add('hydration');
    warnings.push(tx(
      `Mean logged fluid (${round(avgWater)} mL) is under 80% of the planning target (${hydrationTarget} mL).`,
      `Liquides consignés en moyenne (${round(avgWater)} mL) sous 80 % de la cible (${hydrationTarget} mL).`
    ));
    priorities.push(tx('Increase fluid from the drinks that are on the menu. Confirm the log is complete before calling this dehydration.', 'Augmenter les boissons du menu. Vérifier que le journal est complet avant de parler de déshydratation.'));
  }

  const safeMenu = input.menu.filter(food => !blocksFood(food, input.allergies, input.intolerances));
  const excludedFoods = input.menu.filter(food => blocksFood(food, input.allergies, input.intolerances)).map(food => (fr ? food.nameFr : food.nameEn));
  if (excludedFoods.length > 0) {
    warnings.push(tx(
      `Excluded because of recorded allergies or intolerances: ${excludedFoods.join(', ')}.`,
      `Exclus à cause d’allergies ou d’intolérances enregistrées : ${excludedFoods.map(name => name).join(', ')}.`
    ));
  }

  if (focus.size === 0) focus.add('maintenance');
  const mealPlan = safeMenu.length >= 4 ? pickMeals(safeMenu, focus, input.preferences, input.lang) : null;
  if (!mealPlan) {
    warnings.push(tx('Not enough compatible onboard foods to build a four-eating-occasion plan. No foods were invented.', 'Pas assez d’aliments compatibles à bord pour quatre prises. Aucun aliment n’a été inventé.'));
  } else if (kcal != null) {
    const planKcal = mealPlan.reduce((s, slot) => s + slot.items.reduce((a, item) => a + item.kcal * item.portions, 0), 0);
    if (planKcal < kcal * 0.7) {
      const densest = [...safeMenu].sort((a, b) => b.kcal - a.kcal)[0];
      const snack = mealPlan.find(slot => slot.slot === 'SNACK');
      if (densest && snack && !snack.items.some(item => item.code === densest.code)) {
        snack.items.push({
          code: densest.code,
          nameEn: densest.nameEn,
          nameFr: densest.nameFr,
          portions: 1,
          portionLabel: densest.portionLabel,
          prep: densest.prep,
          kcal: densest.kcal,
          proteinG: densest.proteinG,
          reason: tx('Extra onboard portion because the first pass is well below the estimated energy need', 'Portion supplémentaire à bord : la première proposition reste bien sous le besoin estimé')
        });
      }
      observations.push(tx('The suggested portions are a starting plan. They may still sit below the estimated energy need, so the crewmember should add other allowed menu items rather than an unlisted food.', 'Les portions proposées sont un point de départ. Elles peuvent rester sous le besoin estimé : compléter avec d’autres aliments autorisés du menu, pas avec un aliment absent de la liste.'));
    }
  }

  if (input.preferences.length > 0) {
    observations.push(tx(`Recorded preferences considered: ${input.preferences.join(', ')}.`, `Préférences enregistrées prises en compte : ${input.preferences.join(', ')}.`));
  }
  if (input.conditions.length > 0) {
    warnings.push(tx(
      `Pre-existing conditions are on file (${input.conditions.join(', ')}). This plan does not treat them.`,
      `Antécédents au dossier (${input.conditions.join(', ')}). Ce plan ne les traite pas.`
    ));
  }

  const bonePriority = input.boneChangePct != null && input.boneChangePct <= -0.5 ? 'HIGH' : avgCalcium != null && avgCalcium < 800 ? 'MEDIUM' : 'LOW';
  const micronutrients = [
    {
      name: tx('Calcium', 'Calcium'),
      priority: bonePriority as 'HIGH' | 'MEDIUM' | 'LOW',
      reason: tx('Bone mineral loss is a documented spaceflight risk. Food sources on the menu are preferred. This tool does not start a supplement.', 'La perte minérale osseuse est un risque documenté du vol. Les sources alimentaires du menu sont préférées. Cet outil ne démarre pas de complément.'),
      observed: avgCalcium == null ? tx('No intake logged', 'Aucun apport consigné') : tx(`About ${round(avgCalcium)} mg/day in the logged days (demo food estimates)`, `Environ ${round(avgCalcium)} mg/j sur les jours consignés (estimations de démonstration)`)
    },
    {
      name: tx('Vitamin D', 'Vitamine D'),
      priority: (input.boneChangePct != null && input.boneChangePct <= -0.5 ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
      reason: tx('Vitamin D status matters for bone metabolism, and spacecraft diets vary. Status is not measured here unless a value is logged.', 'Le statut en vitamine D compte pour le métabolisme osseux, et les rations varient. Il n’est pas mesuré ici sauf valeur consignée.'),
      observed: avgVitaminD == null ? tx('No intake logged', 'Aucun apport consigné') : tx(`About ${round(avgVitaminD)} IU/day in the logged days (demo food estimates)`, `Environ ${round(avgVitaminD)} UI/j sur les jours consignés (estimations de démonstration)`)
    },
    {
      name: tx('Iron', 'Fer'),
      priority: (input.fatigue != null && input.fatigue >= 6 ? 'MEDIUM' : 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
      reason: tx('Iron is relevant to oxygen transport. Spaceflight also changes iron metabolism, so extra iron is not assumed to be helpful.', 'Le fer participe au transport de l’oxygène. Le vol modifie aussi son métabolisme : un surplus n’est pas présumé utile.'),
      observed: avgIron == null ? tx('No intake logged', 'Aucun apport consigné') : tx(`About ${avgIron.toFixed(1)} mg/day logged (demo food estimates)`, `Environ ${avgIron.toFixed(1)} mg/j consignés (estimations de démonstration)`)
    },
    {
      name: tx('Folate and vitamin B12', 'Folates et vitamine B12'),
      priority: 'LOW' as const,
      reason: tx('Included when the menu and the log allow a comparison. No blood value is invented.', 'Présents quand le menu et le journal permettent une comparaison. Aucune valeur sanguine n’est inventée.'),
      observed: avgFolate == null ? tx('No intake logged', 'Aucun apport consigné') : tx(`Folate about ${round(avgFolate)} µg/day logged. B12 is only as complete as the food table.`, `Folates environ ${round(avgFolate)} µg/j. La B12 n’est connue que dans la limite de la table alimentaire.`)
    },
    {
      name: tx('Magnesium', 'Magnésium'),
      priority: (input.sleepHours != null && input.sleepHours < 6.5 ? 'MEDIUM' : 'LOW') as 'HIGH' | 'MEDIUM' | 'LOW',
      reason: tx('Magnesium is involved in muscle and nerve function. A short sleep record raises its priority for review. It does not prove a deficiency.', 'Le magnésium intervient dans la fonction musculaire et nerveuse. Un sommeil court relève sa priorité de revue. Cela ne prouve pas une carence.'),
      observed: avgMag == null ? tx('No intake logged', 'Aucun apport consigné') : tx(`About ${round(avgMag)} mg/day logged (demo food estimates)`, `Environ ${round(avgMag)} mg/j consignés (estimations de démonstration)`)
    }
  ];

  if (priorities.length === 0) {
    priorities.push(tx('Logged intake, fluid, sleep, and activity do not currently cross a prototype watch rule. Keep logging. This is not a statement that the crewmember is medically well.', 'Apports, liquides, sommeil et activité ne franchissent pas de règle de suivi du prototype. Continuer le journal. Cela ne signifie pas que la personne va bien.'));
  }
  goals.push(tx('Log each eating occasion and drinking amount for the next 3 days.', 'Consigner chaque prise alimentaire et chaque boisson pendant 3 jours.'));
  goals.push(tx('Keep using only foods on the current menu unless the mission log says an item was added.', 'N’utiliser que les aliments du menu actuel, sauf ajout inscrit au journal de mission.'));
  if (proteinTarget != null) goals.push(tx(`Planning protein target: ${proteinTarget} g/day (${proteinPerKg} g/kg). Prototype factor, pending medical validation.`, `Cible protéique de planification : ${proteinTarget} g/j (${proteinPerKg} g/kg). Facteur prototype, en attente de validation médicale.`));

  const nutrientsToWatch = micronutrients.filter(item => item.priority !== 'LOW').map(item => item.name);
  if (focus.has('energy')) nutrientsToWatch.unshift(tx('Energy', 'Énergie'));
  if (focus.has('protein')) nutrientsToWatch.unshift(tx('Protein', 'Protéines'));
  if (focus.has('hydration')) nutrientsToWatch.unshift(tx('Fluid', 'Hydratation'));

  return {
    astronautId: input.astronautId,
    callSign: input.callSign,
    generatedAt: new Date().toISOString(),
    dataQuality: missing.some(item => ['age', 'height', 'weight', 'biological_sex', 'onboard_menu'].includes(item)) ? 'INSUFFICIENT' : 'SUFFICIENT',
    missingData: missing,
    observations,
    energy: {
      estimatedDailyKcal: kcal,
      method,
      note: kcal == null
        ? tx('No energy number is shown because a required input is missing.', 'Aucun chiffre énergétique : une donnée requise manque.')
        : tx('Estimate for planning only. Individual needs differ. A flight surgeon or dietitian validates any change.', 'Estimation de planification seulement. Les besoins diffèrent. Un médecin ou un diététicien valide tout changement.')
    },
    macros: {
      proteinG: {
        target: proteinTarget,
        rationale: input.weightKg == null
          ? tx('No protein target without a measured body mass.', 'Pas de cible protéique sans masse corporelle mesurée.')
          : tx(
            `${proteinPerKg} g/kg × ${input.weightKg} kg. Prototype planning factor for this demo, higher when weight or muscle records are unfavorable. Not a prescription.`,
            `${proteinPerKg} g/kg × ${input.weightKg} kg. Facteur de planification de cette démo, plus haut si la masse ou le muscle est défavorable. Ce n’est pas une prescription.`
          )
      },
      carbsG: {
        target: carbTarget,
        rationale: carbTarget == null
          ? tx('Not calculated without an energy estimate and a protein target.', 'Non calculé sans estimation énergétique et cible protéique.')
          : tx('Remainder of estimated energy after protein and fat shares.', 'Reste de l’énergie estimée après les parts protéines et lipides.')
      },
      fatG: {
        target: fatTarget,
        rationale: fatTarget == null
          ? tx('Not calculated without an energy estimate.', 'Non calculé sans estimation énergétique.')
          : tx('About 28% of estimated energy. Planning split only.', 'Environ 28 % de l’énergie estimée. Répartition de planification seulement.')
      }
    },
    micronutrients,
    hydration: {
      targetMl: hydrationTarget,
      observedAverageMl: avgWater == null ? null : round(avgWater),
      rationale: hydrationTarget == null
        ? tx('No fluid target without body mass.', 'Pas de cible hydrique sans masse corporelle.')
        : tx('Prototype planning volume of 35 mL/kg, plus 400 mL when recorded activity is at least 100 min. Not a NASA fluid requirement.', 'Volume prototype de 35 mL/kg, plus 400 mL si l’activité enregistrée atteint 100 min. Ce n’est pas une exigence hydrique de la NASA.')
    },
    mealPlan,
    excludedFoods,
    priorities,
    warnings,
    nutrientsToWatch,
    shortTermGoals: goals,
    followUp,
    medicalValidationRequired: true,
    disclaimer: tx(
      'GravityCare nutrition output is decision support for a fictional demonstration. It does not prescribe supplements, medicines, or diets. Clinical decisions require a qualified professional.',
      'La sortie nutrition de GravityCare est une aide à la décision pour une démonstration fictive. Elle ne prescrit ni complément, ni médicament, ni régime. Les décisions cliniques reviennent à un professionnel qualifié.'
    ),
    sources: fr
      ? [
        { ...SOURCE_MIFFLIN, note: 'Équation terrestre de dépense de repos. Ici, estimation étiquetée, pas une norme de vol.' },
        { ...SOURCE_NASA_NUTRITION, note: 'Synthèse du laboratoire de biochimie nutritionnelle de la NASA. Les cibles chiffrées de ce prototype restent des facteurs de planification à valider par le médecin.' },
        { ...SOURCE_HRP, note: 'Explique pourquoi os, muscle, nutrition et rayonnement sont suivis ensemble. Cela ne fixe pas à lui seul un régime personnel.' }
      ]
      : [SOURCE_MIFFLIN, SOURCE_NASA_NUTRITION, SOURCE_HRP],
    foodDataNote: tx(FOOD_ESTIMATE_NOTE, 'Les nutriments du menu sont des estimations de démonstration, pas des dosages de laboratoire.')
  };
}
