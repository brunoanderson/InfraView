// =============================================================================
// Todas as rotas da API, sob /api.
//   Públicas: /health, /auth/register, /auth/login
//   Daqui para baixo, TUDO exige token (authenticate). Leitura: admin e viewer.
//   Escrita (dispositivos e "verificar agora"): só admin.
// =============================================================================
import { Router } from 'express';
import { health } from '../controllers/health.controller.js';
import { authenticate } from '../middlewares/auth.js';
import authRoutes from './auth.routes.js';
import deviceRoutes from './device.routes.js';

const router = Router();

// ---- Públicas ----
router.get('/health', health);
router.use('/auth', authRoutes); // /auth/me exige token: está dentro de auth.routes

// ---- Protegidas ----
router.use(authenticate);

router.use('/devices', deviceRoutes);

export default router;
