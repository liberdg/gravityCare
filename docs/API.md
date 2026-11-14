# API

Base URL when the server is running: `http://localhost:3001`

Send `Authorization: Bearer <token>` on every route except login and health.

All crew records returned by a seeded database are fictional.

## Auth

- `POST /api/auth/login` `{ email, password }`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Crew

- `GET /api/astronauts` — astronaut: self; physician: assigned crew; ground and admin: operational fields only
- `GET /api/astronauts/:id`
- `PATCH /api/astronauts/:id` — physician (assigned) or admin. Array fields replace the stored list.
- `POST /api/astronauts/:id/symptoms` `{ content }`
- `POST /api/astronauts/:id/notes` `{ content }` — physician

## Measurements

- `POST /api/vitals` `{ astronautId, type, value, unit, measuredAt? }`
- `GET /api/vitals/astronaut/:astronautId`

A critical screening result is returned with status `SENT_TO_DOCTOR` in this response. Written analysis continues afterwards.

## Nutrition

- `GET /api/nutrition/menu/:missionId`
- `POST /api/nutrition/log`
- `GET /api/nutrition/astronaut/:astronautId`
- `GET /api/nutrition/recommendations/:astronautId`
- `GET /api/nutrition/report/:astronautId`
- `POST /api/nutrition/recommendations/:astronautId/review` `{ status, note }` — physician

Ground and admin accounts receive 403 on nutrition routes.

## Alerts

- `GET /api/alerts`
- `GET /api/alerts/rules`
- `POST /api/alerts`
- `POST /api/alerts/:id/analyze`
- `PATCH /api/alerts/:id/status` `{ status }` — physician or admin

Ground alert objects contain severity, status, title, time, and call sign. They do not contain the analysis narrative.

## Messages

Clinical channel between a crewmember and an assigned physician. Every message is flagged `simulated: true`.

- `GET /api/messages`
- `POST /api/messages` `{ receiverId, content, clientId? }`
- `POST /api/messages/sync` `{ operations: [{ clientId, kind: "message"|"symptom", payload }] }`

## Reports, demo, admin

- `GET /api/reports/astronaut/:astronautId`
- `POST /api/demo/measure` `{ astronautId, scenario: "physio-warning"|"critical-spo2" }`
- `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`
- `GET /api/admin/audit`
- `GET/POST /api/admin/missions`

Admin routes require the `ADMIN` role.
