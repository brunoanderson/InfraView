// Rotas de usuários: tudo só para super admin. (O authenticate já foi aplicado em routes/index.js.)
import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import { requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { userCreateSchema, userUpdateSchema } from '../validators/user.validators.js';

const router = Router();
router.use(requireRole('superadmin'));

router.get('/', userController.list);
router.post('/', validate({ body: userCreateSchema }), userController.create);
router.patch('/:id', validate({ params: idParamSchema, body: userUpdateSchema }), userController.update);
router.delete('/:id', validate({ params: idParamSchema }), userController.remove);

export default router;
