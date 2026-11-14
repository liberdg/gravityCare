/**
 * Prototype screening rules.
 * These bands are for the GravityCare demonstration.
 * They are not NASA flight rules and not universal clinical standards.
 * A missing value never becomes a normal value.
 */

export interface RulePoint {
  value: number;
  measuredAt: Date;
}

export interface AlertDraft {
  type: string;
  severity: 'INFO' | 'WATCH' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  payload: Record<string, unknown>;
}

export const THRESHOLD_SOURCE =
  'GravityCare prototype screening bands for a student demonstration. Not a NASA flight rule, not a device alarm limit, and not a personal medical order.';

function latest(points: RulePoint[]): RulePoint | null {
  if (points.length === 0) return null;
  return [...points].sort((a, b) => +b.measuredAt - +a.measuredAt)[0];
}

function band(value: number, steps: Array<{ severity: AlertDraft['severity']; when: boolean; title: string; description: string }>, type: string, unit: string): AlertDraft | null {
  const hit = steps.find(step => step.when);
  if (!hit) return null;
  return {
    type,
    severity: hit.severity,
    title: hit.title,
    description: hit.description,
    payload: { value, unit, sourceNote: THRESHOLD_SOURCE }
  };
}

export function assessSeries(type: string, points: RulePoint[], unit: string): AlertDraft | null {
  const current = latest(points);
  if (!current) return null;
  const value = current.value;

  if (type === 'HR') {
    return band(value, [
      { severity: 'CRITICAL', when: value >= 150 || value <= 35, title: 'Heart rate in the prototype critical band', description: `Latest heart rate is ${value} ${unit}. Stop non-essential exercise, recheck, and contact the flight surgeon now. This is a screening rule, not a diagnosis.` },
      { severity: 'WARNING', when: value >= 130 || value <= 40, title: 'Heart rate in the prototype warning band', description: `Latest heart rate is ${value} ${unit}. Recheck after rest and report symptoms.` },
      { severity: 'WATCH', when: value >= 110 || value <= 45, title: 'Heart rate in the prototype watch band', description: `Latest heart rate is ${value} ${unit}. Compare with this crewmember’s recent values.` }
    ], type, unit);
  }

  if (type === 'SPO2') {
    return band(value, [
      { severity: 'CRITICAL', when: value < 90, title: 'Oxygen saturation in the prototype critical band', description: `Latest SpO2 is ${value}%. Escalate now. Do not wait for the written analysis.` },
      { severity: 'WARNING', when: value < 92, title: 'Oxygen saturation in the prototype warning band', description: `Latest SpO2 is ${value}%. Recheck the sensor and notify the flight surgeon.` },
      { severity: 'WATCH', when: value < 95, title: 'Oxygen saturation in the prototype watch band', description: `Latest SpO2 is ${value}%. Confirm the reading.` }
    ], type, unit);
  }

  if (type === 'TEMP') {
    return band(value, [
      { severity: 'CRITICAL', when: value >= 39.5 || value <= 35, title: 'Temperature in the prototype critical band', description: `Latest temperature is ${value} ${unit}. Escalate now.` },
      { severity: 'WARNING', when: value >= 38.5 || value <= 35.5, title: 'Temperature in the prototype warning band', description: `Latest temperature is ${value} ${unit}.` },
      { severity: 'WATCH', when: value >= 37.8, title: 'Temperature in the prototype watch band', description: `Latest temperature is ${value} ${unit}.` }
    ], type, unit);
  }

  if (type === 'GLUCOSE') {
    return band(value, [
      { severity: 'CRITICAL', when: value < 54 || value > 250, title: 'Glucose in the prototype critical band', description: `Latest glucose is ${value} mg/dL. Escalate now. Do not change medication from this tool.` },
      { severity: 'WARNING', when: value < 70 || value > 180, title: 'Glucose in the prototype warning band', description: `Latest glucose is ${value} mg/dL. Repeat the measurement.` }
    ], type, unit);
  }

  if (type === 'BP_SYS') {
    return band(value, [
      { severity: 'CRITICAL', when: value >= 180 || value <= 80, title: 'Systolic pressure in the prototype critical band', description: `Latest systolic pressure is ${value} mmHg. Escalate now.` },
      { severity: 'WARNING', when: value >= 160 || value <= 90, title: 'Systolic pressure in the prototype warning band', description: `Latest systolic pressure is ${value} mmHg.` },
      { severity: 'WATCH', when: value >= 140, title: 'Systolic pressure in the prototype watch band', description: `Latest systolic pressure is ${value} mmHg.` }
    ], type, unit);
  }

  if (type === 'SLEEP_HOURS') {
    return band(value, [
      { severity: 'WARNING', when: value < 5, title: 'Sleep duration in the prototype warning band', description: `Latest sleep record is ${value} h. Look at schedule, symptoms, intake, and hydration together.` },
      { severity: 'WATCH', when: value < 6.5, title: 'Sleep duration in the prototype watch band', description: `Latest sleep record is ${value} h.` }
    ], type, unit);
  }

  if (type === 'FATIGUE') {
    return band(value, [
      { severity: 'WARNING', when: value >= 8, title: 'Fatigue score in the prototype warning band', description: `Self-reported fatigue is ${value}/10.` },
      { severity: 'WATCH', when: value >= 6, title: 'Fatigue score in the prototype watch band', description: `Self-reported fatigue is ${value}/10.` }
    ], type, unit);
  }

  if (type === 'STRESS') {
    return band(value, [
      { severity: 'WARNING', when: value >= 8, title: 'Stress score in the prototype warning band', description: `Self-reported stress is ${value}/10.` },
      { severity: 'WATCH', when: value >= 6, title: 'Stress score in the prototype watch band', description: `Self-reported stress is ${value}/10.` }
    ], type, unit);
  }

  if (type === 'BONE_CHANGE_PCT') {
    return band(value, [
      { severity: 'WARNING', when: value <= -1, title: 'Bone change in the prototype warning band', description: `Recorded bone change is ${value}%. Nutrition alone does not treat bone loss.` },
      { severity: 'WATCH', when: value <= -0.5, title: 'Bone change in the prototype watch band', description: `Recorded bone change is ${value}%. Review calcium, vitamin D, and resistive exercise.` }
    ], type, unit);
  }

  if (type === 'MUSCLE_SCORE') {
    return band(value, [
      { severity: 'WATCH', when: value < 70, title: 'Muscle score in the prototype watch band', description: `Muscle score is ${value}. Review protein intake and resistive exercise. This score is a demo index, not a clinical test.` }
    ], type, unit);
  }

  if (type === 'RAD_USV_H') {
    return band(value, [
      { severity: 'CRITICAL', when: value >= 500, title: 'Radiation rate in the prototype critical band', description: `Dose rate ${value} µSv/h. Follow the mission shelter procedure immediately. This tool does not name or dose medication.` },
      { severity: 'WARNING', when: value >= 100, title: 'Radiation rate in the prototype warning band', description: `Dose rate ${value} µSv/h. Follow the mission radiation procedure.` }
    ], type, unit);
  }

  if (type === 'WEIGHT') {
    const sorted = [...points].sort((a, b) => +a.measuredAt - +b.measuredAt);
    if (sorted.length < 2) return null;
    const delta = sorted[sorted.length - 1].value - sorted[0].value;
    return band(delta, [
      { severity: 'WARNING', when: delta <= -3, title: 'Body mass trend in the prototype warning band', description: `Recorded mass changed by ${delta.toFixed(1)} kg across ${sorted.length} measurements. Review intake, activity, and fluid. Do not assume the cause.` },
      { severity: 'WATCH', when: delta <= -1.5, title: 'Body mass trend in the prototype watch band', description: `Recorded mass changed by ${delta.toFixed(1)} kg across ${sorted.length} measurements.` }
    ], 'WEIGHT_TREND', 'kg');
  }

  return null;
}

const KIND_FR: Record<string, string> = {
  HR: 'Fréquence cardiaque',
  SPO2: 'Saturation en oxygène',
  TEMP: 'Température',
  GLUCOSE: 'Glucose',
  BP_SYS: 'Pression systolique',
  SLEEP_HOURS: 'Durée de sommeil',
  FATIGUE: 'Score de fatigue',
  STRESS: 'Score de stress',
  BONE_CHANGE_PCT: 'Variation osseuse',
  MUSCLE_SCORE: 'Indice musculaire',
  RAD_USV_H: 'Débit de dose',
  WEIGHT_TREND: 'Tendance de masse'
};

const BAND_FR: Record<string, string> = {
  CRITICAL: 'bande critique',
  WARNING: 'bande importante',
  WATCH: 'bande de suivi',
  INFO: 'information'
};

export function presentAlert(type: string, severity: string, title: string, description: string, payload: unknown, lang: 'en' | 'fr') {
  if (lang !== 'fr' || !KIND_FR[type]) return { title, description };
  const data = payload && typeof payload === 'object' ? payload as { value?: unknown; unit?: unknown } : {};
  const unit = data.unit === 'score' ? '/10' : data.unit;
  const value = data.value == null ? '' : `${data.value}${unit ? ` ${unit}` : ''}`;
  return {
    title: `${KIND_FR[type]} — ${BAND_FR[severity] ?? 'bande du prototype'} du prototype`,
    description: value
      ? `Dernière valeur : ${value}. Règle de dépistage du prototype, pas un diagnostic.`
      : 'Règle de dépistage du prototype. Ce n’est pas un diagnostic.'
  };
}

export const CRITICAL_SYMPTOM_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /unconscious|inconscient|not breathing|ne respire pas|chest pain|douleur thoracique|severe bleeding|h[ée]morragie/i, label: 'critical symptom keyword' }
];
