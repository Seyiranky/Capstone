import { User, SkillTask, Skill, Gig, Match, Transaction, Review, Message } from '../models';
import { PdfDocument } from '../lib/pdf';
import { locationName } from '../lib/locationName';

/**
 * Everything the platform holds about one person, for their own copy.
 *
 * The same records feed two formats: JSON, complete and machine-readable, and
 * a PDF report a person can open, read and print. Related names (the gig a job
 * was for, who a message went to) are included so the PDF can say them.
 */
export const collect = async (userId: string) => {
  const gigWithClient = { model: Gig, as: 'gig', include: [{ model: User, as: 'client' }] };
  const [
    profile,
    skillTasksAsWorker,
    skillTasksAsReviewer,
    gigsPosted,
    matchesAsWorker,
    matchesAsClient,
    reviewsGiven,
    reviewsReceived,
    messagesSent,
    messagesReceived,
  ] = await Promise.all([
    User.findByPk(userId),
    SkillTask.findAll({ where: { workerId: userId }, include: [{ model: Skill, as: 'skill' }], order: [['createdAt', 'ASC']] }),
    SkillTask.findAll({ where: { reviewerId: userId }, include: [{ model: Skill, as: 'skill' }], order: [['createdAt', 'ASC']] }),
    Gig.findAll({ where: { clientId: userId }, order: [['createdAt', 'ASC']] }),
    Match.findAll({ where: { workerId: userId }, include: [gigWithClient], order: [['createdAt', 'ASC']] }),
    Match.findAll({
      include: [
        { model: Gig, as: 'gig', where: { clientId: userId }, required: true },
        { model: User, as: 'worker' },
      ],
      order: [['createdAt', 'ASC']],
    }),
    Review.findAll({ where: { authorId: userId }, include: [{ model: User, as: 'recipient' }], order: [['createdAt', 'ASC']] }),
    Review.findAll({ where: { recipientId: userId }, include: [{ model: User, as: 'author' }], order: [['createdAt', 'ASC']] }),
    Message.findAll({ where: { senderId: userId }, include: [{ model: User, as: 'recipient' }], order: [['createdAt', 'ASC']] }),
    Message.findAll({ where: { recipientId: userId }, include: [{ model: User, as: 'sender' }], order: [['createdAt', 'ASC']] }),
  ]);

  const matchIds = [...matchesAsWorker, ...matchesAsClient].map((m) => m.id);
  const transactions = matchIds.length
    ? await Transaction.findAll({ where: { matchId: matchIds }, order: [['createdAt', 'ASC']] })
    : [];

  return {
    exportedAt: new Date().toISOString(),
    profile,
    skillTasksAsWorker,
    skillTasksAsReviewer,
    gigsPosted,
    matchesAsWorker,
    matchesAsClient,
    transactions,
    reviewsGiven,
    reviewsReceived,
    messagesSent,
    messagesReceived,
  };
};

type Collected = Awaited<ReturnType<typeof collect>>;

/** The JSON form: the records as stored, with the profile's private fields. */
export const toJson = (data: Collected) => ({ ...data, profile: data.profile?.privateJSON() ?? null });

const date = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Kigali' }) : null;
const dateTime = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('en-GB', {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kigali',
      })
    : null;
const rwf = (n: number | string | null | undefined) =>
  n === null || n === undefined ? null : `${Math.round(Number(n)).toLocaleString('en-US')} RWF`;
const words = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : null);
const yes = (d: Date | null | undefined) => (d ? `Yes, ${date(d)}` : 'No');
const messageText = (m: Message) =>
  [m.body, m.imageUrl ? '[photo]' : '', m.audioUrl ? '[voice note]' : ''].filter(Boolean).join(' ');

/** The PDF form: the same records as a readable report. */
export const toPdf = (data: Collected): Buffer => {
  const p = data.profile!;
  const doc = new PdfDocument(`Isoko · Your data · ${p.name}`);
  const isWorker = p.role === 'worker';

  doc.title(
    'Your Isoko data',
    `A copy of everything Isoko holds about ${p.name}, exported ${dateTime(data.exportedAt)} (Kigali time). ` +
      'The JSON export from the same page holds these records in machine-readable form.',
  );

  doc.heading('Profile');
  doc.fields([
    ['Name', p.name],
    ['Email', p.email],
    ['Email confirmed', yes(p.emailVerifiedAt)],
    ['Phone', p.phone],
    ['Phone confirmed', yes(p.phoneVerifiedAt)],
    ['Account type', words(p.role)],
    ['Account status', words(p.status)],
    ['Member since', date(p.createdAt)],
    ['Area', locationName(p.locationLat, p.locationLng)],
    ['Language', p.preferredLanguage === 'rw' ? 'Kinyarwanda' : 'English'],
    ['Notifications by', p.preferredChannel === 'none' ? 'In the app only' : words(p.preferredChannel)],
    ['Bio', p.bio],
    ...(isWorker
      ? ([
          ['Experience', p.experienceSummary],
          ['Years doing this work', p.yearsExperience],
          ['Availability', words(p.availability)],
          ['Trust score', p.reviewCount ? `${Number(p.trustScore).toFixed(1)} of 5, from ${p.reviewCount} reviews` : 'No reviews yet'],
          ['Paid jobs completed', p.completedJobCount],
        ] as [string, string | number | null][])
      : []),
    ['Profile picture', p.avatarUrl ? 'Yes' : 'No'],
  ]);

  if (isWorker || data.skillTasksAsWorker.length) {
    doc.heading('Skills you submitted for review', `${data.skillTasksAsWorker.length}`);
    if (data.skillTasksAsWorker.length) {
      doc.table(
        [
          { header: 'Skill', width: 3 },
          { header: 'Kind', width: 2 },
          { header: 'Status', width: 1.6 },
          { header: 'Submitted', width: 1.6 },
          { header: 'Decided', width: 1.6 },
        ],
        data.skillTasksAsWorker.map((s) => [s.skill?.name, words(s.kind), words(s.status), date(s.createdAt), date(s.reviewedAt)]),
      );
    } else doc.muted('None yet.');
  }

  if (data.skillTasksAsReviewer.length) {
    doc.heading('Skills you reviewed for others', `${data.skillTasksAsReviewer.length}`);
    doc.table(
      [
        { header: 'Skill', width: 3 },
        { header: 'Status', width: 1.6 },
        { header: 'Submitted', width: 1.6 },
        { header: 'Decided', width: 1.6 },
      ],
      data.skillTasksAsReviewer.map((s) => [s.skill?.name, words(s.status), date(s.createdAt), date(s.reviewedAt)]),
    );
  }

  if (!isWorker || data.gigsPosted.length) {
    doc.heading('Gigs you posted', `${data.gigsPosted.length}`);
    if (data.gigsPosted.length) {
      doc.table(
        [
          { header: 'Gig', width: 4 },
          { header: 'Budget', width: 1.6, align: 'right' },
          { header: 'Status', width: 1.6 },
          { header: 'Posted', width: 1.6 },
        ],
        data.gigsPosted.map((g) => [g.title, rwf(g.budget), words(g.status), date(g.createdAt)]),
      );
    } else doc.muted('None yet.');
  }

  const jobRows = [
    ...data.matchesAsWorker.map((m) => [m.gig?.title, `Worker for ${m.gig?.client?.name ?? '—'}`, m]),
    ...data.matchesAsClient.map((m) => [m.gig?.title, `Client of ${m.worker?.name ?? '—'}`, m]),
  ] as [string | undefined, string, Match & { gig?: Gig }][];
  doc.heading('Jobs', `${jobRows.length}`);
  if (jobRows.length) {
    doc.table(
      [
        { header: 'Gig', width: 3.4 },
        { header: 'Your role', width: 2.6 },
        { header: 'Price', width: 1.6, align: 'right' },
        { header: 'Status', width: 1.4 },
        { header: 'Started', width: 1.6 },
      ],
      jobRows.map(([title, role, m]) => [title, role, rwf(m.agreedAmount ?? m.gig?.budget), words(m.status), date(m.createdAt)]),
    );
  } else doc.muted('None yet.');

  doc.heading('Payments', `${data.transactions.length}`);
  if (data.transactions.length) {
    doc.table(
      [
        { header: 'Receipt', width: 2.2 },
        { header: 'Amount', width: 1.8, align: 'right' },
        { header: 'Status', width: 1.4 },
        { header: 'Paid by', width: 2 },
        { header: 'Date', width: 1.8 },
      ],
      data.transactions.map((t) => [
        t.receiptNumber ?? (t.reference.length > 18 ? `${t.reference.slice(0, 16)}…` : t.reference),
        rwf(t.amount),
        t.status === 'confirmed' ? 'Paid' : words(t.status),
        t.provider === 'mtn-momo' || t.provider === 'simulated-momo' ? 'Mobile Money' : t.provider,
        date(t.releasedAt ?? t.createdAt),
      ]),
    );
  } else doc.muted('None yet.');

  const reviewTable = (rows: Review[], who: (r: Review) => string | undefined) =>
    doc.table(
      [
        { header: 'Person', width: 2 },
        { header: 'Rating', width: 1, align: 'right' },
        { header: 'Comment', width: 4.4 },
        { header: 'Date', width: 1.6 },
      ],
      rows.map((r) => [who(r), `${r.rating} / 5`, r.comment, date(r.createdAt)]),
    );
  doc.heading('Reviews you received', `${data.reviewsReceived.length}`);
  if (data.reviewsReceived.length) reviewTable(data.reviewsReceived, (r) => (r as Review & { author?: User }).author?.name);
  else doc.muted('None yet.');
  doc.heading('Reviews you wrote', `${data.reviewsGiven.length}`);
  if (data.reviewsGiven.length) reviewTable(data.reviewsGiven, (r) => (r as Review & { recipient?: User }).recipient?.name);
  else doc.muted('None yet.');

  const messages = [
    ...data.messagesSent.map((m) => ({ m, line: `To ${(m as Message & { recipient?: User }).recipient?.name ?? '—'}` })),
    ...data.messagesReceived.map((m) => ({ m, line: `From ${(m as Message & { sender?: User }).sender?.name ?? '—'}` })),
  ].sort((a, b) => a.m.createdAt.getTime() - b.m.createdAt.getTime());
  doc.heading('Messages', `${data.messagesSent.length} sent · ${data.messagesReceived.length} received`);
  if (messages.length) {
    doc.table(
      [
        { header: 'When', width: 1.9 },
        { header: 'With', width: 1.8 },
        { header: 'Message', width: 5.3 },
      ],
      messages.map(({ m, line }) => [dateTime(m.createdAt), line, messageText(m)]),
    );
  } else doc.muted('None yet.');

  doc.muted(
    'Photos, voice notes and documents you uploaded are listed but not included in this file. ' +
      'To correct or delete anything here, contact the Isoko team.',
  );
  return doc.toBuffer();
};
