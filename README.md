# GravityCare — Orbital Medical OS

Fictional health-monitoring prototype for the NASA Space Apps Challenge. It follows one crewmember at a time: profile, measurements, nutrition, alerts, a written analysis, and a simulated physician channel.

This is not a medical device. It does not diagnose, prescribe, or use real medical records.

## What is real in this build

- Sign-in is required. Passwords are hashed. Routes check the role on the server.
- An astronaut can open only their own record.
- A physician sees only assigned crewmembers.
- Ground and admin accounts receive mission and alert status, not allergies, history, or nutrition plans.
- Nutrition targets change with the person. Missing age, height, mass, sex, or activity produces no energy number.
- Foods that conflict with a recorded allergy or intolerance are removed. The planner does not invent foods that are not on the mission menu.
- A critical screening result is saved as sent to the physician before the written analysis finishes.
- The written analysis is a rule engine. An external model is used only when `AI_API_KEY` and `AI_BASE_URL` are set on the server. If that call fails, the rules still answer.
- The browser never receives an API key.

The cockpit, ECG drawing, body map, and solar / CO2 buttons are a scripted visual simulator. Numbers on that cockpit are not the database. Nutrition, alerts, messages, ground, and admin screens are the database.

## Run

Requirements: Node.js 20 or newer.

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3001](http://localhost:3001). The first screen is the sign-in form.

Demo password for every account: `demo1234`

| Role | Email |
|---|---|
| Astronaut, stable intake | k.vance@nasa.gov |
| Astronaut, falling mass | m.chen@nasa.gov |
| Astronaut, short sleep | a.diallo@nasa.gov |
| Astronaut, bone watch, lactose intolerance | l.tremblay@asc-csa.gc.ca |
| Flight surgeon | flight.surgeon@nasa.gov |
| Ground | ground.ops@nasa.gov |
| Admin | admin@gravitycare.space |

All four crewmembers are fictional and assigned to the flight surgeon.

## Checks

```bash
cd backend
npm test
```

Eleven tests cover sign-in, a rejected body, record isolation, the ground view, a critical SpO2 response, two different meal plans, physician validation, and the nutrition rules for missing data and allergies.

## Layout

```
backend/src/auth          sign-in and session check
backend/src/access        who can see a record
backend/src/astronauts    profiles, symptoms, physician notes
backend/src/vitals        measurements and alert creation
backend/src/alerts        screening rules and alert lifecycle
backend/src/nutrition     personal planner and menu
backend/src/ai            rule analysis, optional external model
backend/src/messages      simulated crew–physician channel and offline sync
backend/src/admin         accounts, missions, security log
public/index.html         interface, including the original cockpit
docs/                     API, nutrition, thresholds
```

`frontend/` is the unused Vite template kept from the previous archive. The running interface is `public/index.html`, served by the API.

## Limits

Screening numbers are documented in [docs/THRESHOLDS.md](docs/THRESHOLDS.md) as prototype bands, not flight rules. Nutrition factors are documented in [docs/NUTRITION.md](docs/NUTRITION.md). Food composition values are demonstration estimates.

Messages are labeled as a simulation. There is no live link to Earth and no encrypted medical vault, even where the older cockpit still shows mission-style labels.

## License

MIT, with the medical disclaimer in `LICENSE`.

Publishing this repository on GitHub is described in [docs/SETUP.md](docs/SETUP.md).
