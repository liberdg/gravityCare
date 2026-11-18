# GravityCare — Orbital Medical OS

## Public demo

**Live application:** https://gravitycare.onrender.com/

Demo password for every account: `demo1234`.

Fictional health-monitoring prototype for the NASA Space Apps Challenge. It follows one crewmember at a time: profile, measurements, nutrition, alerts, a written analysis, and a simulated physician channel.

This is not a medical device. It does not diagnose, prescribe, or use real medical records.

## What is real in this build

- Sign-in is required. Passwords are hashed. Routes check the role on the server.
- An astronaut can open only their own record.
- A physician sees only assigned crewmembers.
- Sleep, well-being, bone, muscle, and activity observations are stored in a role-scoped health log; astronauts can self-report and assigned physicians can add clinician observations.
- Ground and admin accounts receive mission and alert status, not allergies, history, or nutrition plans.
- Nutrition targets change with the person. Missing age, height, mass, sex, or activity produces no energy number.
- Foods that conflict with a recorded allergy or intolerance are removed. The planner does not invent foods that are not on the mission menu.
- A critical screening result is saved as sent to the physician before the written analysis finishes.
- Alert reports use the built-in rule engine and can optionally use an external model when `AI_API_KEY` and `AI_BASE_URL` are configured server-side.
- The cockpit Copilot supports multi-turn chat and symptom analysis through the server-side Google Gemini API. It receives only the synthetic snapshot shown in the cockpit; database alert reports continue to use the authenticated, role-scoped backend workflow.
- The browser never receives an API key. The public demo Copilot endpoint has a basic per-IP rate limit; configure API spend limits before sharing the demo widely.

The cockpit, ECG drawing, anatomical illustration, and solar / CO2 buttons include scripted demonstration data. They are not live sensor feeds. The anatomical map is an educational interaction, not clinical imaging. Recorded vital measurements and health-log entries are stored separately in PostgreSQL; their source and timestamps are shown in the health workspace. Nutrition, alerts, messages, ground, and admin screens use database records.

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

## Free deployment (Render + Neon)

The application is deployed as one Node/Express service: Express serves both the API and `public/index.html`. The old `frontend/` Vite template is not deployed separately.

1. Create a free PostgreSQL project on Neon and copy its pooled connection string. Keep `sslmode=require` in the URL.
2. In Render, choose **New > Blueprint** and select this repository. Render reads the root `render.yaml` file.
3. When prompted, provide the Neon connection string as `DATABASE_URL`. Render generates `JWT_SECRET` automatically.
4. To enable the Copilot, create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey), then set `AI_PROVIDER=gemini`, `AI_API_KEY` to that key, `AI_MODEL=gemini-3.8-flash`, and `AI_FALLBACK_MODEL=gemini-3.5-flash-lite` in Render's server-side Environment settings. Keep the key out of GitHub and the browser. Gemini's free tier has model-specific rate limits and Google may use free-tier submitted content to improve its products; use synthetic demonstration data only. If the primary model returns a temporary 503 overload, the Copilot automatically tries the fallback model once. Without a key, alert analysis falls back to the built-in rules and the Copilot chat returns a configuration message.
5. Deploy. The build generates Prisma Client, compiles TypeScript, creates/updates the PostgreSQL schema, and seeds the fictional demo records only when the database has no users.

The seed operation is guarded: subsequent deployments will not delete or replace existing user data. To intentionally recreate the demo dataset, clear the database yourself before deploying; this deletes all records.

Render's free web service may sleep after inactivity, and its local filesystem is temporary. PostgreSQL on Neon is therefore used instead of a local SQLite file. Free hosting is suitable for a demonstration, not a production medical service.

After deployment, verify `https://YOUR-SERVICE.onrender.com/api/health`.

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
backend/src/health        protected sleep, well-being, bone, muscle and activity logs
backend/src/alerts        screening rules and alert lifecycle
backend/src/nutrition     personal planner and menu
backend/src/ai            rule analysis, optional external model
backend/src/copilot      Gemini-powered chat and symptom analysis
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
