// =============================================================================
// Todas as rotas da API, sob /api.
//   Públicas: /health, /auth/register, /auth/login
//   Daqui para baixo, TUDO exige token (authenticate). Leitura: admin e viewer.
//   Escrita (dispositivos, "verificar agora", reconhecer alerta): só admin.
// =============================================================================
import { Router } from 'express';
import { health } from '../controllers/health.controller.js';
import * as report from '../controllers/report.controller.js';
import { authenticate, requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { alertQuerySchema, eventQuerySchema } from '../validators/report.validators.js';
import authRoutes from './auth.routes.js';
import deviceRoutes from './device.routes.js';

const router = Router();

// ---- Públicas ----
router.get('/health', health);
router.use('/auth', authRoutes); // /auth/me exige token: está dentro de auth.routes

// ---- Protegidas ----
router.use(authenticate);

router.use('/devices', deviceRoutes);
router.get('/categories', report.categories);
router.get('/events', validate({ query: eventQuerySchema }), report.events);
router.get('/alerts', validate({ query: alertQuerySchema }), report.alerts);
router.patch('/alerts/:id/ack', requireRole('admin'), validate({ params: idParamSchema }), report.acknowledgeAlert);
router.get('/dashboard/summary', report.dashboard);
router.get('/monitor/status', report.monitorStatus);

export default router;
