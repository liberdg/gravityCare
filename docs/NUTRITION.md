# Nutrition module

The planner is `backend/src/nutrition/nutrition.engine.ts`. It is a rule engine, not a dietitian and not a language model.

## What it uses

Only values present on the crew record: age, height, mass, biological sex, activity minutes, sleep, fatigue, bone change, muscle score, glucose, allergies, intolerances, preferences, logged intake, and the mission menu.

If age, height, mass, sex, or activity is missing, **no energy number is produced**.

## How the numbers are labeled

- Energy: Mifflin–St Jeor (Mifflin et al., Am J Clin Nutr. 1990;51:241-247), a terrestrial equation, multiplied by 1.4, 1.55, or 1.7 from the recorded activity. Those factors are prototype planning factors, not a NASA requirement.
- Protein: 1.2 g/kg, or 1.5 g/kg when the mass trend or the muscle score crosses a prototype watch rule. Not a prescription.
- Fluid: 35 mL/kg, plus 400 mL when activity is at least 100 minutes. Not a NASA fluid requirement.
- Menu composition: demonstration estimates in `backend/src/nutrition/menu.data.ts`. Not laboratory assays of flown food.

## What a plan contains

Estimated needs when the inputs exist, a split of protein, carbohydrate, and fat, four eating occasions chosen from foods that are on the menu and do not conflict with recorded allergies or intolerances, fluid guidance, nutrients to watch, and the list of missing inputs.

Two different records produce different energy targets and different meals. The seeded comparison is CDR. Vance (stable, salmon preference) and MS-2. Tremblay (bone watch, lactose intolerance).

A physician accepts, edits, or rejects the plan with `POST /api/nutrition/recommendations/:id/review`. Until then the status stays `DRAFT`.

## Sources named in the output

- Mifflin et al., 1990, for the resting-energy equation only.
- Smith SM, Zwart SR, Heer M. *Human Adaptation to Spaceflight: The Role of Nutrition.* NASA.
- NASA Human Research Program overview of the five hazards of human spaceflight.

The engine does not invent a citation for a number it cannot trace. Prototype factors say so in the rationale field.
