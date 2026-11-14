/**
 * Rule-based alert analysis.
 * Uses the crewmember context together. Optional external model is separate.
 * Critical escalation does not wait for this function.
 */

export interface AiReport {
  alertId: string;
  astronautId: string;
  callSign: string;
  generatedAt: string;
  engine: 'rules' | 'external';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  nature: string;
  summary: string;
  dataUsed: string[];
  historyComparison: string;
  anomalies: string[];
  hypotheses: string[];
  nutritionNotes: string[];
  immediateActions: string[];
  actionsToAvoid: string[];
  monitoring: string[];
  confidence: number;
  limits: string[];
  sources: string[];
  requiresMedicalReview: boolean;
  urgentMedicalAttention: boolean;
}

export interface AnalysisContext {
  alert: {
    id: string;
    astronautId: string;
    type: string;
    severity: string;
    title: string;
    description: string;
    payload: unknown;
    createdAt: string;
  };
  astronaut: {
    callSign: string;
    age: number | null;
    sex: string | null;
    allergies: string[];
    conditions: string[];
    missionName: string | null;
    missionDay: number | null;
    demoScenario: string | null;
  };
  latestVitals: Array<{ type: string; value: number; unit: string; measuredAt: string }>;
  historySummary: string;
  symptoms: string[];
  sleepHours: number | null;
  activityMin: number | null;
  hydrationMl: number | null;
  intakeKcal: number | null;
  intakeProtein: number | null;
}

const PRIORITY: Record<string, AiReport['priority']> = {
  INFO: 'LOW',
  WATCH: 'MEDIUM',
  WARNING: 'HIGH',
  CRITICAL: 'CRITICAL'
};

export function analyzeWithRules(ctx: AnalysisContext): AiReport {
  const type = ctx.alert.type.toUpperCase();
  const anomalies = [ctx.alert.description];
  const hypotheses: string[] = [];
  const nutritionNotes: string[] = [];
  const immediate: string[] = [];
  const avoid = [
    'Do not start, stop, or change a medicine from this screen.',
    'Do not treat this text as a diagnosis.'
  ];
  const monitoring: string[] = ['Recheck the triggering measurement and record symptoms with the time.'];
  const dataUsed = [
    `Alert ${ctx.alert.type} at ${ctx.alert.createdAt}`,
    ...ctx.latestVitals.slice(0, 8).map(v => `${v.type}=${v.value} ${v.unit} @ ${v.measuredAt}`)
  ];

  if (ctx.sleepHours != null) dataUsed.push(`sleep=${ctx.sleepHours} h`);
  if (ctx.activityMin != null) dataUsed.push(`activity=${ctx.activityMin} min`);
  if (ctx.hydrationMl != null) dataUsed.push(`recent hydration log=${ctx.hydrationMl} mL`);
  if (ctx.intakeKcal != null) dataUsed.push(`recent intake≈${Math.round(ctx.intakeKcal)} kcal`);
  if (ctx.symptoms.length > 0) dataUsed.push(`symptoms: ${ctx.symptoms.join(' | ')}`);

  if (type.includes('SPO2') || type.includes('HR') || type.includes('TEMP') || type.includes('BP') || type.includes('GLUCOSE')) {
    immediate.push('Pause non-essential physical activity until the value is rechecked.');
    immediate.push('Tell the crew medical officer what you feel right now: breathing, chest, vision, dizziness, nausea.');
    hypotheses.push('Sensor artifact, acute strain, dehydration, environment, or illness can all move this value. The record does not separate them.');
  }

  if (type.includes('RAD')) {
    immediate.unshift('Follow the mission radiation shelter procedure now. Do not wait for this analysis.');
    avoid.push('Do not stay in a lightly shielded area to finish the checklist.');
    avoid.push('This prototype does not name or dose a radioprotective drug.');
    hypotheses.push('The rate may reflect a solar particle event or another radiation environment change. Confirm with the vehicle dosimetry procedure.');
    monitoring.push('Log dose rate on the mission cadence until the procedure says the event is over.');
  }

  if (type.includes('WEIGHT') || type.includes('NUTRITION')) {
    nutritionNotes.push('Compare the mass trend with logged energy, protein, and fluid before calling it undernutrition.');
    if (ctx.intakeKcal != null) nutritionNotes.push(`A recent intake figure on file is about ${Math.round(ctx.intakeKcal)} kcal. That is a log, not a measured expenditure.`);
    hypotheses.push('Lower intake, higher expenditure, fluid shift, or incomplete logs can move body mass.');
    immediate.push('Keep logging meals and fluid. Repeat body mass with the same method.');
  }

  if (type.includes('BONE') || type.includes('MUSCLE')) {
    nutritionNotes.push('Review calcium, vitamin D, and protein from foods that are on the menu. Nutrition alone does not treat bone or muscle loss.');
    hypotheses.push('Unloading in microgravity plus exercise and intake patterns can move these indices. This tool does not assign a cause.');
    immediate.push('Continue the prescribed resistive exercise countermeasure unless the flight surgeon says otherwise.');
  }

  if (type.includes('SLEEP') || type.includes('FATIGUE')) {
    if (ctx.hydrationMl != null && ctx.hydrationMl < 2000) {
      nutritionNotes.push('Logged fluid is under 2000 mL in the figure passed to this analysis. Confirm the log before calling it low intake.');
    }
    nutritionNotes.push('A large late meal or a stimulant drink can be reviewed against the sleep window. Food is not assumed to be the cause of the short sleep.');
    hypotheses.push('Schedule, workload, environment, symptoms, and intake can coincide with short sleep. Coincidence is not causation.');
    monitoring.push('Record sleep hours and fatigue again tomorrow.');
  }

  if (ctx.alert.severity === 'CRITICAL') {
    immediate.unshift('Medical escalation is already required. Analysis must not delay that call.');
  }

  if (ctx.astronaut.allergies.length > 0) {
    nutritionNotes.push(`Allergies on file: ${ctx.astronaut.allergies.join(', ')}. Do not suggest conflicting foods.`);
  }

  let confidence = 0.35;
  if (ctx.historySummary.includes('prior')) confidence += 0.15;
  if (ctx.intakeKcal != null) confidence += 0.1;
  if (ctx.sleepHours != null) confidence += 0.05;
  if (ctx.latestVitals.length >= 4) confidence += 0.1;
  confidence = Math.min(0.8, Number(confidence.toFixed(2)));

  const urgent = ctx.alert.severity === 'CRITICAL';

  return {
    alertId: ctx.alert.id,
    astronautId: ctx.alert.astronautId,
    callSign: ctx.astronaut.callSign,
    generatedAt: new Date().toISOString(),
    engine: 'rules',
    priority: PRIORITY[ctx.alert.severity] ?? 'MEDIUM',
    nature: ctx.alert.title,
    summary: `${ctx.astronaut.callSign}: ${ctx.alert.title}. Priority ${PRIORITY[ctx.alert.severity] ?? 'MEDIUM'}. ${ctx.historySummary}`,
    dataUsed,
    historyComparison: ctx.historySummary,
    anomalies,
    hypotheses,
    nutritionNotes,
    immediateActions: immediate.length > 0 ? immediate : ['Confirm the data and follow the mission medical procedure.'],
    actionsToAvoid: avoid,
    monitoring,
    confidence,
    limits: [
      'Generated by the GravityCare rule engine.',
      'Hypotheses are not diagnoses.',
      'Missing data was not replaced with a normal value.',
      'A flight surgeon validates any clinical or nutrition decision.',
      ctx.astronaut.demoScenario ? `Demonstration profile tag: ${ctx.astronaut.demoScenario}. All crew data in this build are fictional.` : 'Crew data in this build are fictional.'
    ],
    sources: [
      'NASA Human Research Program — five hazards of human spaceflight (public program overview).',
      'Smith SM, Zwart SR, Heer M. Human Adaptation to Spaceflight: The Role of Nutrition. NASA.',
      'GravityCare prototype screening bands (see docs/THRESHOLDS.md). These are not flight rules.'
    ],
    requiresMedicalReview: ctx.alert.severity === 'WARNING' || ctx.alert.severity === 'CRITICAL' || ctx.alert.severity === 'WATCH',
    urgentMedicalAttention: urgent
  };
}
