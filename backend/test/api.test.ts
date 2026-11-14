import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

const dbFile = path.resolve('/tmp/gravitycare-test.db');
process.env.DATABASE_URL = `file:${dbFile}`;
process.env.JWT_SECRET = 'test-secret-not-for-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.NODE_ENV = 'test';
delete process.env.AI_API_KEY;
delete process.env.AI_BASE_URL;

let server: Server;
let base: string;

async function login(email: string) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234' })
  });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ token: string; user: { role: string; astronautProfileId: string | null; id: string } }>;
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

before(async () => {
  fs.rmSync(dbFile, { force: true });
  execSync('npx prisma db push --skip-generate', {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: process.env,
    stdio: 'inherit'
  });
  execSync('npx tsx prisma/seed.ts', {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: process.env,
    stdio: 'inherit'
  });
  const { createApp } = await import('../src/app.ts');
  const app = createApp();
  server = app.listen(0);
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  fs.rmSync(dbFile, { force: true });
});

test('login and logout', async () => {
  const session = await login('k.vance@nasa.gov');
  assert.equal(session.user.role, 'ASTRONAUT');
  const me = await fetch(`${base}/api/auth/me`, { headers: auth(session.token) });
  assert.equal(me.status, 200);
  const out = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: auth(session.token) });
  assert.equal(out.status, 200);
});

test('invalid login body is 400 and unknown user is 401', async () => {
  const bad = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email', password: 'demo1234' })
  });
  assert.equal(bad.status, 400);
  const missing = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'demo1234' })
  });
  assert.equal(missing.status, 401);
});

test('astronaut cannot read another medical record', async () => {
  const vance = await login('k.vance@nasa.gov');
  const doctor = await login('flight.surgeon@nasa.gov');
  const crew = await fetch(`${base}/api/astronauts`, { headers: auth(doctor.token) }).then(r => r.json()) as Array<{ id: string; callSign: string }>;
  const chen = crew.find(member => member.callSign === 'PLT. Chen');
  assert.ok(chen);
  const denied = await fetch(`${base}/api/astronauts/${chen!.id}`, { headers: auth(vance.token) });
  assert.equal(denied.status, 403);
  const own = await fetch(`${base}/api/astronauts`, { headers: auth(vance.token) });
  const ownBody = await own.json() as Array<{ callSign: string; allergies: string[] }>;
  assert.equal(ownBody.length, 1);
  assert.equal(ownBody[0].callSign, 'CDR. Vance');
});

test('ground crew does not receive allergies', async () => {
  const ground = await login('ground.ops@nasa.gov');
  const list = await fetch(`${base}/api/astronauts`, { headers: auth(ground.token) }).then(r => r.json()) as Array<Record<string, unknown>>;
  assert.ok(list.length >= 4);
  assert.equal('allergies' in list[0], false);
  assert.equal('medicalHistory' in list[0], false);
  const detail = await fetch(`${base}/api/astronauts/${list[0].id}`, { headers: auth(ground.token) }).then(r => r.json()) as Record<string, unknown>;
  assert.equal('allergies' in detail, false);
  assert.equal(detail.note != null, true);
});

test('critical SpO2 is sent to the physician in the create response', async () => {
  const vance = await login('k.vance@nasa.gov');
  const response = await fetch(`${base}/api/vitals`, {
    method: 'POST',
    headers: auth(vance.token),
    body: JSON.stringify({
      astronautId: vance.user.astronautProfileId,
      type: 'SPO2',
      value: 88,
      unit: '%'
    })
  });
  assert.equal(response.status, 201);
  const body = await response.json() as { alerts: Array<{ type: string; severity: string; status: string }> };
  const alert = body.alerts.find(item => item.type === 'SPO2');
  assert.ok(alert);
  assert.equal(alert!.severity, 'CRITICAL');
  assert.equal(alert!.status, 'SENT_TO_DOCTOR');
});

test('nutrition plans differ and a physician can validate one', async () => {
  const doctor = await login('flight.surgeon@nasa.gov');
  const crew = await fetch(`${base}/api/astronauts`, { headers: auth(doctor.token) }).then(r => r.json()) as Array<{ id: string; callSign: string }>;
  const vance = crew.find(member => member.callSign === 'CDR. Vance')!;
  const tremblay = crew.find(member => member.callSign === 'MS-2. Tremblay')!;
  const a = await fetch(`${base}/api/nutrition/recommendations/${vance.id}`, { headers: auth(doctor.token) }).then(r => r.json()) as { recommendation: { energy: { estimatedDailyKcal: number }; mealPlan: unknown; priorities: string[] } };
  const b = await fetch(`${base}/api/nutrition/recommendations/${tremblay.id}`, { headers: auth(doctor.token) }).then(r => r.json()) as { recommendation: { energy: { estimatedDailyKcal: number }; mealPlan: unknown } };
  assert.notEqual(a.recommendation.energy.estimatedDailyKcal, b.recommendation.energy.estimatedDailyKcal);
  assert.notEqual(JSON.stringify(a.recommendation.mealPlan), JSON.stringify(b.recommendation.mealPlan));
  const review = await fetch(`${base}/api/nutrition/recommendations/${vance.id}/review`, {
    method: 'POST',
    headers: auth(doctor.token),
    body: JSON.stringify({ status: 'VALIDATED', note: 'Fictional review for the demonstration. No clinical order.' })
  });
  assert.equal(review.status, 201);
});

test('unauthenticated API access is rejected', async () => {
  const response = await fetch(`${base}/api/astronauts`);
  assert.equal(response.status, 401);
});
