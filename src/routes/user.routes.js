// Rotas de usuários: tudo só para admin. (O authenticate já foi aplicado em routes/index.js.)
import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { userUpdateSchema } from '../validators/user.validators.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/', userController.list);
router.patch('/:id', validate({ params: idParamSchema, body: userUpdateSchema }), userController.update);
router.delete('/:id', validate({ params: idParamSchema }), userController.remove);

export default router;
