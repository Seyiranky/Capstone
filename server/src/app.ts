import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import skillRoutes from './routes/skillRoutes';
import skillTaskRoutes from './routes/skillTaskRoutes';
import gigRoutes from './routes/gigRoutes';
import gigApplicationRoutes from './routes/gigApplicationRoutes';
import matchRoutes from './routes/matchRoutes';
import transactionRoutes from './routes/transactionRoutes';
import reviewRoutes from './routes/reviewRoutes';
import messageRoutes from './routes/messageRoutes';
import notificationRoutes from './routes/notificationRoutes';
import passportRoutes from './routes/passportRoutes';
import receiptRoutes from './routes/receiptRoutes';
import disputeRoutes from './routes/disputeRoutes';
import teamRoutes from './routes/teamRoutes';
import fairworkRoutes from './routes/fairworkRoutes';
import safetyNetRoutes from './routes/safetyNetRoutes';
import webhookRoutes from './routes/webhookRoutes';
import reportRoutes from './routes/reportRoutes';
import voiceRoutes from './routes/voiceRoutes';
import adminRoutes from './routes/adminRoutes';
import { notFound, errorHandler } from './middleware/errorMiddleware';
import { corsOptions, securityHeaders } from './middleware/security';
import { protectPrivateUploads } from './lib/signedUploads';

const app = express();

// Behind one proxy in deployment (Render/Railway/nginx), so req.ip is the
// caller's address rather than the proxy's; rate limits key on it.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// uploads/ sits beside src/, not inside it, so that the same path resolves
// whether this file runs from src/ under tsx or from dist/ after a build.
// Chat media and skill evidence are private: served only with a signed,
// expiring link that the API hands to the people allowed to see them.
app.use('/uploads', protectPrivateUploads, express.static(path.join(__dirname, '..', 'uploads'), { dotfiles: 'deny', index: false }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/skills', skillRoutes);
app.use('/api/skill-tasks', skillTaskRoutes);
app.use('/api/gigs', gigRoutes);
app.use('/api/gig-applications', gigApplicationRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/passports', passportRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/fairwork', fairworkRoutes);
app.use('/api/safety-net', safetyNetRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

/**
 * Exported with `export =` so `require('../../app')` keeps returning the app
 * itself. Nine integration tests hand this straight to supertest, and a
 * default export would give them `{ default: app }` instead.
 */
export = app;
