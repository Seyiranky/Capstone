#!/usr/bin/env node
/**
 * API response times, against NFR-2: "standard API endpoints (excluding the
 * matching computation and external payment calls) shall respond within 500 ms
 * under normal test load".
 *
 *   node perf/api-latency.mjs                                  # local API
 *   node perf/api-latency.mjs --base https://isoko-api.onrender.com/api --requests 60 --concurrency 1,5
 *
 * Signs in as two demo accounts (a client and a worker), then sends N requests
 * to each standard endpoint at each concurrency level, and reports p50, p95,
 * p99 and the slowest response, and any errors. No dependencies: Node's fetch.
 * Writes the full results to --out (JSON) as well as printing a table.
 */
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4000/api').replace(/\/$/, '');
const REQUESTS = Number(arg('requests', 200));
const LEVELS = arg('concurrency', '1,10,25').split(',').map(Number);
const OUT = arg('out', null);
const PASSWORD = 'password123';

/** The endpoints NFR-2 covers: everyday reads, not ranking and not payments. */
const ENDPOINTS = [
  { name: 'GET /gigs', path: '/gigs', as: 'client' },
  { name: 'GET /users/me', path: '/users/me', as: 'worker' },
  { name: 'GET /notifications', path: '/notifications', as: 'worker' },
  { name: 'GET /matches', path: '/matches', as: 'client' },
  { name: 'GET /gig-applications', path: '/gig-applications', as: 'worker' },
  { name: 'GET /users/directory', path: '/users/directory', as: 'client' },
];

const signIn = async (email) => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!body.token) throw new Error(`Could not sign in as ${email}: ${JSON.stringify(body)}`);
  return body.token;
};

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

const run = async (endpoint, token, concurrency) => {
  const times = [];
  let errors = 0;
  let next = 0;
  const started = performance.now();
  const worker = async () => {
    while (next < REQUESTS) {
      next += 1;
      const t0 = performance.now();
      try {
        const res = await fetch(`${BASE}${endpoint.path}`, { headers: { Authorization: `Bearer ${token}` } });
        await res.arrayBuffer();
        if (!res.ok) errors += 1;
      } catch {
        errors += 1;
      }
      times.push(performance.now() - t0);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const seconds = (performance.now() - started) / 1000;
  const sorted = times.sort((a, b) => a - b);
  const round = (n) => Math.round(n);
  return {
    endpoint: endpoint.name,
    concurrency,
    requests: times.length,
    errors,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(sorted[sorted.length - 1]),
    perSecond: Math.round(times.length / seconds),
  };
};

const main = async () => {
  const tokens = { client: await signIn('grace@isoko.demo'), worker: await signIn('eric@isoko.demo') };
  // One unmeasured request each, so the first measurement is not a cold start.
  for (const e of ENDPOINTS) await fetch(`${BASE}${e.path}`, { headers: { Authorization: `Bearer ${tokens[e.as]}` } });

  const results = [];
  for (const concurrency of LEVELS) {
    for (const endpoint of ENDPOINTS) results.push(await run(endpoint, tokens[endpoint.as], concurrency));
  }

  console.log(`\nAPI response times, ${BASE}, ${REQUESTS} requests per endpoint per level (ms)\n`);
  console.log('| Endpoint | Concurrent | p50 | p95 | p99 | Slowest | Req/s | Errors | Within 500 ms (p95) |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.endpoint} | ${r.concurrency} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${r.perSecond} | ${r.errors} | ${r.p95 <= 500 ? 'yes' : 'NO'} |`);
  }
  if (OUT) writeFileSync(OUT, JSON.stringify({ base: BASE, requests: REQUESTS, at: new Date().toISOString(), results }, null, 2));
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
