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
import surveyRoutes from './routes/surveyRoutes';
import passportRoutes from './routes/passportRoutes';
import receiptRoutes from './routes/receiptRoutes';
import webhookRoutes from './routes/webhookRoutes';
import adminRoutes from './routes/adminRoutes';
import { notFound, errorHandler } from './middleware/errorMiddleware';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// uploads/ sits beside src/, not inside it, so that the same path resolves
// whether this file runs from src/ under tsx or from dist/ after a build.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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
app.use('/api/surveys', surveyRoutes);
app.use('/api/passports', passportRoutes);
app.use('/api/receipts', receiptRoutes);
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
