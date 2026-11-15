# Setup

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Start

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

The API and the interface are both at `http://localhost:3001`.

`JWT_SECRET` in `.env` must be changed before any shared deployment. Leave `AI_API_KEY` empty to stay on the rule engine. If you set `AI_API_KEY` and `AI_BASE_URL`, the server calls that endpoint itself. Do not put the key in `public/`.

## Demo accounts

Password: `demo1234`

- k.vance@nasa.gov — astronaut, stable fictional record
- m.chen@nasa.gov — astronaut, falling mass and low logged intake, peanut allergy
- a.diallo@nasa.gov — astronaut, short sleep and high fatigue
- l.tremblay@asc-csa.gc.ca — astronaut, bone-change watch, lactose intolerance
- flight.surgeon@nasa.gov — physician for all four
- ground.ops@nasa.gov — operational view only
- admin@gravitycare.space — accounts, missions, security log

## Tests

```bash
cd backend
npm test
```

## Tests that were run

On this machine, `npm test` completed with 11 passing tests and 0 failures. `npx tsc --noEmit` completed with no errors.

## Publish on GitHub

The first commit is already on local `main`. There is no remote yet. `.env` and `*.db` stay out of git. Do not commit the empty `package-lock.json` at the project root; the real lockfile is `backend/package-lock.json`.

1. Create an empty repository on GitHub. Do not add a README, license, or `.gitignore` there, or the first push will need a merge.
2. From the project root:

```bash
git remote add origin https://github.com/YOUR_USER/gravitycare.git
git push -u origin main
```

Replace `YOUR_USER` with the GitHub account. If GitHub asks for a password, use a personal access token with the `repo` scope, or sign in with `gh auth login` after installing the GitHub CLI.

Someone who clones the repository starts it the same way as above: `cd backend`, copy `.env.example` to `.env`, install, generate, push the schema, seed, then `npm run dev`. The database file is created on their machine. It is not in the repository.
