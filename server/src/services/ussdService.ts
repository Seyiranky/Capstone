import type { Request } from 'express';
import { Op } from 'sequelize';
import { Gig, GigApplication, Match, Payout, Skill, Transaction, User, UserSkill } from '../models';
import * as escrowService from './escrowService';
import * as matchScoringService from './matchScoringService';
import notify from '../lib/notify';
import { locationName } from '../lib/locationName';

/**
 * USSD menus for workers on basic phones.
 *
 * Africa's Talking (and most USSD gateways) call the app once per screen with
 * the whole session so far in `text`, as the choices joined by "*": "" is the
 * first screen, "1" the reply after pressing 1, "1*2" after 1 then 2. The
 * reply starts with CON (show this and wait for input) or END (show and hang
 * up). So the menu is a pure function of who is calling and what they pressed.
 *
 * A screen holds about 160 characters; every text here is written to fit.
 */
type AppContext = Pick<Request, 'app'> | undefined;
type Lang = 'en' | 'rw';

const T = {
  en: {
    home: 'Isoko Talents\n1. Jobs for me\n2. My active job\n3. My earnings\n4. Kinyarwanda',
    noJobs: 'No open jobs in your trades right now. We will text you when one is posted.',
    jobsHead: 'Jobs for you:',
    apply: '1. Apply\n0. Back',
    applied: 'Applied. You will get an SMS when the client decides.',
    alreadyApplied: 'You have already applied to this job.',
    notOpen: 'This job is no longer open.',
    noActive: 'You have no job in progress.',
    activeHead: 'Your jobs:',
    escrowHeld: 'Paid in: {amount} RWF held',
    escrowWaiting: 'Waiting for the client to pay in',
    enterCode: '1. Enter completion code\n0. Back',
    askCode: 'Enter the 4-digit code the client gave you:',
    paid: 'Done! {amount} RWF is released to you. Receipt by SMS.',
    wrong: 'Wrong code. {left} tries left.',
    locked: 'Code locked after too many tries. Ask the client to release payment in the app.',
    disputed: 'Payment is frozen while a dispute is open.',
    earnings: 'This month: {month} RWF\nAll time: {all} RWF\nPaid jobs: {jobs}',
    language: 'Ururimi: Ikinyarwanda. Mwakoze!',
    invalid: 'Invalid choice.',
    unknown: 'This number is not linked to an Isoko worker account. Confirm your phone in the Isoko app first.',
  },
  rw: {
    home: 'Isoko Talents\n1. Akazi kanjye\n2. Akazi ndimo\n3. Ibyo nakoreye\n4. English',
    noJobs: "Nta kazi gafunguye mu byo ukora ubu. Tuzakoherereza SMS nikaboneka.",
    jobsHead: 'Akazi kakubereye:',
    apply: '1. Saba aka kazi\n0. Subira inyuma',
    applied: "Wasabye. Uzabona SMS umukiriya nafata icyemezo.",
    alreadyApplied: 'Wamaze gusaba aka kazi.',
    notOpen: 'Aka kazi ntikakiboneka.',
    noActive: 'Nta kazi urimo ubu.',
    activeHead: 'Akazi kawe:',
    escrowHeld: 'Byishyuwe: {amount} RWF birabitswe',
    escrowWaiting: 'Bitegereje ko umukiriya yishyura',
    enterCode: '1. Andika kode yo kurangiza\n0. Subira inyuma',
    askCode: 'Andika kode y’imibare 4 umukiriya yaguhaye:',
    paid: 'Byarangiye! {amount} RWF yakugezeho. Inyemezabwishyu kuri SMS.',
    wrong: 'Kode si yo. Usigaje inshuro {left}.',
    locked: 'Kode yafunzwe. Saba umukiriya kurekura amafaranga muri porogaramu.',
    disputed: 'Amafaranga arahagaritswe kubera impaka zifunguye.',
    earnings: 'Uku kwezi: {month} RWF\nKuva watangira: {all} RWF\nAkazi wishyuwe: {jobs}',
    language: 'Language: English. Thank you!',
    invalid: 'Ihitamo ritemewe.',
    unknown: 'Iyi nimero ntihuye na konti y’umukozi kuri Isoko. Banza wemeze telefoni yawe muri porogaramu.',
  },
} as const;

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const rwf = (n: number) => Math.round(n).toLocaleString('en-US');
const con = (text: string) => `CON ${text}`;
const end = (text: string) => `END ${text}`;
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 2).trimEnd()}..` : s);

/** Applies "0 = back": each 0 removes itself and the choice before it. */
export const path = (text: string): string[] => {
  const out: string[] = [];
  for (const part of text ? text.split('*') : []) {
    if (part === '0') out.pop();
    else out.push(part.trim());
  }
  return out;
};

/** Open gigs in the worker's trades they have not applied to, newest first, at most three. */
const jobsFor = async (worker: User) => {
  const mine = await UserSkill.findAll({ where: { userId: worker.id }, include: [{ model: Skill, as: 'skill' }] });
  const categories = [...new Set(mine.map((us) => (us as UserSkill & { skill?: Skill }).skill?.category).filter(Boolean))];
  const applied = (await GigApplication.findAll({ where: { workerId: worker.id }, attributes: ['gigId'] })).map((a) => a.gigId);
  return Gig.findAll({
    where: { status: 'open', ...(applied.length ? { id: { [Op.notIn]: applied } } : {}) },
    include: [{ model: Skill, as: 'skill', ...(categories.length ? { where: { category: categories } } : {}) }],
    order: [['createdAt', 'DESC'], ['id', 'ASC']],
    limit: 3,
  });
};

const activeJobs = (worker: User) =>
  Match.findAll({
    where: { workerId: worker.id, status: 'accepted' },
    include: [{ model: Gig, as: 'gig' }, { model: Transaction, as: 'transaction' }],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    limit: 3,
  }) as Promise<(Match & { gig?: Gig; transaction?: Transaction | null })[]>;

const apply = async (ctx: AppContext, worker: User, gig: Gig, s: (typeof T)[Lang]) => {
  if (gig.status !== 'open') return end(s.notOpen);
  if (await GigApplication.findOne({ where: { gigId: gig.id, workerId: worker.id } })) return end(s.alreadyApplied);
  const scored = await matchScoringService.scoreOne({ gig, worker });
  await GigApplication.create({
    gigId: gig.id,
    workerId: worker.id,
    status: 'pending',
    occurredAt: new Date(),
    wasQueuedOffline: false,
    rankScore: scored.score,
    scoreBreakdown: scored,
    weightProfileId: scored.weightProfile.id,
    quoteAmount: null,
    quoteNote: null,
    crew: [],
  });
  for (const admin of await User.findAll({ where: { role: 'admin' }, attributes: ['id'] })) {
    await notify(ctx, { userId: admin.id, title: 'New gig application', body: `${worker.name} applied to "${gig.title}" by USSD.` });
  }
  return end(s.applied);
};

/** One USSD screen for a worker, given the session's input so far. */
export const respond = async (ctx: AppContext, worker: User, text: string): Promise<string> => {
  const lang: Lang = worker.preferredLanguage === 'rw' ? 'rw' : 'en';
  const s = T[lang];
  const [first, second, third, fourth] = path(text);

  if (!first) return con(s.home);

  if (first === '1') {
    const jobs = await jobsFor(worker);
    if (!jobs.length) return end(s.noJobs);
    if (!second) {
      const lines = jobs.map((g, i) => `${i + 1}. ${short(g.title, 28)} ${rwf(Number(g.budget))}`);
      return con([s.jobsHead, ...lines, '0. <'].join('\n'));
    }
    const gig = jobs[Number(second) - 1];
    if (!gig) return end(s.invalid);
    if (!third) {
      const area = locationName(gig.locationLat, gig.locationLng);
      return con(`${short(gig.title, 60)}\n${rwf(Number(gig.budget))} RWF${area ? `, ${area}` : ''}\n${s.apply}`);
    }
    return third === '1' ? apply(ctx, worker, gig, s) : end(s.invalid);
  }

  if (first === '2') {
    const jobs = await activeJobs(worker);
    if (!jobs.length) return end(s.noActive);
    // One job goes straight to it; several are listed first.
    const pick = jobs.length === 1 ? 0 : second ? Number(second) - 1 : -1;
    if (pick === -1) {
      return con([s.activeHead, ...jobs.map((m, i) => `${i + 1}. ${short(m.gig?.title ?? '', 30)}`), '0. <'].join('\n'));
    }
    const job = jobs[pick];
    if (!job) return end(s.invalid);
    const [action, code] = jobs.length === 1 ? [second, third] : [third, fourth];
    const held = job.transaction?.escrowStatus === 'held';
    if (!action) {
      const money = held ? fill(s.escrowHeld, { amount: rwf(Number(job.transaction?.amount)) }) : s.escrowWaiting;
      return con(`${short(job.gig?.title ?? '', 60)}\n${money}\n${held ? s.enterCode : '0. <'}`);
    }
    if (action !== '1' || !held) return end(s.invalid);
    if (!code) return con(s.askCode);
    const { result, attemptsLeft } = await escrowService.checkCompletionCode(ctx, job.id, code);
    if (result === 'wrong') return end(fill(s.wrong, { left: attemptsLeft }));
    if (result === 'locked') return end(s.locked);
    if (result === 'disputed') return end(s.disputed);
    if (result === 'notInProgress') return end(s.noActive);
    return end(fill(s.paid, { amount: rwf(Number(job.transaction?.amount)) }));
  }

  if (first === '3') {
    const payouts = await Payout.findAll({ where: { userId: worker.id }, attributes: ['amount', 'releasedAt'] });
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const month = payouts.filter((p) => p.releasedAt >= start).reduce((a, p) => a + Number(p.amount), 0);
    const all = payouts.reduce((a, p) => a + Number(p.amount), 0);
    return end(fill(s.earnings, { month: rwf(month), all: rwf(all), jobs: payouts.length }));
  }

  if (first === '4') {
    await worker.update({ preferredLanguage: lang === 'rw' ? 'en' : 'rw' });
    return end(s.language);
  }

  return end(s.invalid);
};

export const unknownCaller = (lang: Lang = 'en') => end(T[lang].unknown);
