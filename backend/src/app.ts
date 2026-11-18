import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter } from './auth/auth.routes.js';
import { astronautsRouter } from './astronauts/astronauts.routes.js';
import { vitalsRouter } from './vitals/vitals.routes.js';
import { nutritionRouter } from './nutrition/nutrition.routes.js';
import { alertsRouter } from './alerts/alerts.routes.js';
import { messagesRouter } from './messages/messages.routes.js';
import { adminRouter } from './admin/admin.routes.js';
import { reportsRouter } from './reports/reports.routes.js';
import { demoRouter } from './demo/demo.routes.js';
import { copilotRouter } from './copilot/copilot.routes.js';
import { errorHandler } from './common/errorHandler.js';
import { authMiddleware } from './auth/auth.middleware.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true
  }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'GravityCare API',
      version: '2.0.0',
      ai: process.env.AI_API_KEY ? (process.env.AI_PROVIDER || 'gemini') : 'rules',
      data: 'fictional-demo'
    });
  });

  app.use('/api/auth', authRouter);
  // Public demo Copilot: accepts only the synthetic snapshot rendered by the demo UI.
  app.use('/api/copilot', copilotRouter);
  app.use('/api/astronauts', authMiddleware, astronautsRouter);
  app.use('/api/vitals', authMiddleware, vitalsRouter);
  app.use('/api/nutrition', authMiddleware, nutritionRouter);
  app.use('/api/alerts', authMiddleware, alertsRouter);
  app.use('/api/messages', authMiddleware, messagesRouter);
  app.use('/api/admin', authMiddleware, adminRouter);
  app.use('/api/reports', authMiddleware, reportsRouter);
  app.use('/api/demo', authMiddleware, demoRouter);

  app.use(express.static(path.resolve(__dirname, '../../public')));
  app.use(errorHandler);
  return app;
}
