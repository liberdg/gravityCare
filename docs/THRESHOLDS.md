# Thresholds

Every band in `backend/src/alerts/alert.rules.ts` is a **prototype screening rule for this demonstration**.

They are not NASA flight rules, not medical-device alarm limits, and not personal clinical orders. A missing measurement is never treated as normal.

| Signal | Watch | Warning | Critical |
|---|---|---|---|
| Heart rate (bpm) | ≥110 or ≤45 | ≥130 or ≤40 | ≥150 or ≤35 |
| SpO2 (%) | <95 | <92 | <90 |
| Temperature (°C) | ≥37.8 | ≥38.5 or ≤35.5 | ≥39.5 or ≤35 |
| Glucose (mg/dL) | — | <70 or >180 | <54 or >250 |
| Systolic pressure (mmHg) | ≥140 | ≥160 or ≤90 | ≥180 or ≤80 |
| Sleep (h) | <6.5 | <5 | — |
| Fatigue or stress (0–10) | ≥6 | ≥8 | — |
| Bone change (%) | ≤ −0.5 | ≤ −1 | — |
| Muscle score (demo index) | <70 | — | — |
| Dose rate (µSv/h) | — | ≥100 | ≥500 |
| Body-mass change across the stored series (kg) | ≤ −1.5 | ≤ −3 | — |

Critical results are stored as `SENT_TO_DOCTOR` before the written analysis runs. The analysis does not choose a medicine or a dose.

Keyword escalation for a reported symptom (`chest pain`, `unconscious`, `not breathing`, and the French equivalents in the source file) is also critical and immediate. A keyword is not a diagnosis.
