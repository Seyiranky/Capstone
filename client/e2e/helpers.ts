import { expect, type Browser, type Page } from '@playwright/test';

/** The API the end-to-end web build talks to (see playwright.config.ts). */
export const API = 'http://localhost:4100/api';
export const PASSWORD = 'password123';

export const ACCOUNTS = {
  admin: 'admin@isoko.demo',
  client: 'grace@isoko.demo',
  worker: 'eric@isoko.demo',
} as const;

/** A label no other run or project shares, so tests never collide on data. */
export const unique = (label: string, project: string) =>
  `${label} ${project} ${Date.now().toString(36)}`;

/** Signs in through the real sign-in form. */
export const signIn = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.fill('input[autocomplete=email]', email);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/dashboard/);
};

/** A fresh browser session for one person (a client and a worker are two people). */
export const sessionFor = async (browser: Browser, email: string, contextOptions = {}) => {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  await signIn(page, email);
  return { context, page };
};

const tokenCache = new Map<string, string>();
export const token = async (email: string) => {
  if (!tokenCache.has(email)) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    tokenCache.set(email, (await res.json()).token);
  }
  return tokenCache.get(email) as string;
};

const api = async (method: string, path: string, as: string, body?: unknown) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token(as)}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
};

/**
 * A gig posted by the demo client and approved by an admin, through the API,
 * so a test starts from a gig workers can see without clicking through setup.
 */
export const postApprovedGig = async ({ title, sensitive = false, budget = 5000 }: { title: string; sensitive?: boolean; budget?: number }) => {
  const skills = (await api('GET', '/skills', ACCOUNTS.client)) as { id: string; category: string; parentId: string | null }[];
  const skill = skills.find((s) => s.category === 'digital_web' && !s.parentId) ?? skills[0];
  const gig = await api('POST', '/gigs', ACCOUNTS.client, {
    title,
    description: 'Created by the end-to-end tests. Update three pages of a small salon website.',
    budget,
    skillId: skill.id,
    locationLat: -1.9536,
    locationLng: 30.1044,
    sensitive,
  });
  await api('PUT', `/admin/gigs/${gig.id}/review`, ACCOUNTS.admin, { decision: 'approved' });
  return gig as { id: string; title: string };
};

/**
 * Confirms an Ant Design dialog by its button, once the dialog has finished
 * animating in (a tap during the animation can be lost on mobile WebKit), and
 * waits for it to close.
 */
export const confirmDialog = async (page: Page, button: string) => {
  const dialog = page.locator('.ant-modal-wrap:visible .ant-modal').last();
  await dialog.waitFor();
  await page.waitForFunction(() => !document.querySelector('.ant-zoom-appear, .ant-zoom-enter'));
  await dialog.getByRole('button', { name: button }).click();
  await expect(dialog).toBeHidden();
};

