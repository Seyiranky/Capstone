#!/usr/bin/env node
/**
 * Page load on a desktop and on a low-end phone, from a cold cache.
 *
 *   npm run build && npx vite preview --port 4173      # in one terminal
 *   node perf/page-metrics.mjs                           # local production build
 *   node perf/page-metrics.mjs --web https://isoko-web.onrender.com --api https://isoko-api.onrender.com/api
 *
 * The low-end profile is the standard mobile throttling Lighthouse uses: CPU
 * slowed 4x, 1.6 Mb/s down, 750 kb/s up, 150 ms round trip, on a 360 x 740
 * screen. Each page is loaded 3 times in a fresh browser context (nothing
 * cached) and the median is reported: first contentful paint, largest
 * contentful paint, DOM ready, load, the JavaScript and total bytes
 * transferred, the number of requests, and the JavaScript heap afterwards.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const WEB = arg('web', 'http://localhost:4173').replace(/\/$/, '');
const API = arg('api', 'http://localhost:4000/api').replace(/\/$/, '');
const RUNS = Number(arg('runs', 3));
const OUT = arg('out', null);

const PROFILES = {
  desktop: { viewport: { width: 1280, height: 800 }, cpu: 1, network: null },
  'low-end phone': {
    viewport: { width: 360, height: 740 },
    cpu: 4,
    network: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
  },
};

/** The sign-in page as a visitor, and the dashboard as a signed-in client. */
const PAGES = [
  { name: 'Sign-in page', path: '/login', signedIn: false, ready: 'input[type=password]' },
  { name: 'Dashboard (client)', path: '/dashboard', signedIn: true, ready: '.ant-layout-content .ant-card' },
];

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const tokenFor = async (email) => {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123' }),
  });
  return (await res.json()).token;
};

const measure = async (browser, profile, page, token) => {
  const context = await browser.newContext({ viewport: profile.viewport, serviceWorkers: 'block' });
  if (token) await context.addInitScript((t) => localStorage.setItem('token', t), token);
  const tab = await context.newPage();
  const cdp = await context.newCDPSession(tab);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  if (profile.network) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.network });

  const types = new Map();
  let jsBytes = 0;
  let totalBytes = 0;
  let requests = 0;
  cdp.on('Network.responseReceived', (e) => types.set(e.requestId, e.type));
  cdp.on('Network.loadingFinished', (e) => {
    requests += 1;
    totalBytes += e.encodedDataLength;
    if (types.get(e.requestId) === 'Script') jsBytes += e.encodedDataLength;
  });
  await tab.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  await tab.goto(`${WEB}${page.path}`, { waitUntil: 'load', timeout: 120_000 });
  await tab.waitForSelector(page.ready, { timeout: 120_000 });
  await tab.waitForLoadState('networkidle', { timeout: 120_000 }).catch(() => undefined);
  const timing = await tab.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return { fcp: fcp ? fcp.startTime : null, lcp: window.__lcp || null, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd };
  });
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await context.close();
  return { ...timing, jsKB: jsBytes / 1024, totalKB: totalBytes / 1024, requests, heapMB: metrics.JSHeapUsedSize / 1024 / 1024 };
};

const main = async () => {
  const browser = await chromium.launch();
  const token = await tokenFor('grace@isoko.demo');
  const rows = [];
  for (const [profileName, profile] of Object.entries(PROFILES)) {
    for (const page of PAGES) {
      const runs = [];
      for (let i = 0; i < RUNS; i += 1) runs.push(await measure(browser, profile, page, page.signedIn ? token : null));
      const m = (k) => median(runs.map((r) => r[k] ?? 0));
      rows.push({
        profile: profileName,
        page: page.name,
        fcp: Math.round(m('fcp')),
        lcp: Math.round(m('lcp')),
        domReady: Math.round(m('dcl')),
        load: Math.round(m('load')),
        jsKB: Math.round(m('jsKB')),
        totalKB: Math.round(m('totalKB')),
        requests: Math.round(m('requests')),
        heapMB: Number(m('heapMB').toFixed(1)),
      });
    }
  }
  await browser.close();

  console.log(`\nPage load, ${WEB}, median of ${RUNS} cold loads\n`);
  console.log('| Profile | Page | First paint (ms) | Largest paint (ms) | DOM ready (ms) | Load (ms) | JS transferred (KB) | Total transferred (KB) | Requests | JS heap (MB) |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(`| ${r.profile} | ${r.page} | ${r.fcp} | ${r.lcp} | ${r.domReady} | ${r.load} | ${r.jsKB} | ${r.totalKB} | ${r.requests} | ${r.heapMB} |`);
  }
  if (OUT) writeFileSync(OUT, JSON.stringify({ web: WEB, runs: RUNS, at: new Date().toISOString(), rows }, null, 2));
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
