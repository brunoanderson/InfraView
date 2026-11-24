// =============================================================================
// Todas as rotas da API, sob /api.
//   Públicas: /health, /auth/register, /auth/login
//   Daqui para baixo, TUDO exige token (authenticate). Leitura: admin e viewer.
//   Escrita (dispositivos, "verificar agora", reconhecer alerta): só admin.
// =============================================================================
import { Router } from 'express';
import { health } from '../controllers/health.controller.js';
import * as alertController from '../controllers/alert.controller.js';
import * as categoryController from '../controllers/category.controller.js';
import * as dashboardController from '../controllers/dashboard.controller.js';
import * as eventController from '../controllers/event.controller.js';
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
router.get('/categories', categoryController.list);
router.get('/events', validate({ query: eventQuerySchema }), eventController.list);
router.get('/alerts', validate({ query: alertQuerySchema }), alertController.list);
router.patch('/alerts/:id/ack', requireRole('admin'), validate({ params: idParamSchema }), alertController.acknowledge);
router.get('/dashboard/summary', dashboardController.summary);
router.get('/monitor/status', dashboardController.monitorStatus);

export default router;
