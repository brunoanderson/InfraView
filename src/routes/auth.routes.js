import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { authLimiter } from '../middlewares/rateLimit.js';
import { validate } from '../middlewares/validate.js';
import { loginSchema, registerSchema } from '../validators/auth.validators.js';

const router = Router();

// Ordem: limite de tentativas -> validação -> controller
router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);
router.get('/me', authenticate, authController.me);

export default router;
