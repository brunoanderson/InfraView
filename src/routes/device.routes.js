// Rotas de dispositivos. Leitura: qualquer usuário logado. Escrita: só admin.
// (O authenticate já foi aplicado em routes/index.js.)
import { Router } from 'express';
import * as deviceController from '../controllers/device.controller.js';
import { requireRole } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema } from '../validators/common.validators.js';
import { deviceBodySchema, deviceQuerySchema, measurementQuerySchema } from '../validators/device.validators.js';

const router = Router();
const adminOnly = requireRole('admin');

router.get('/', validate({ query: deviceQuerySchema }), deviceController.list);
// Antes de /:id, senão o Express trataria "measurements" como um id.
router.get('/measurements', validate({ query: measurementQuerySchema }), deviceController.measurementsOfAll);
router.get('/:id', validate({ params: idParamSchema }), deviceController.show);
router.get('/:id/measurements', validate({ params: idParamSchema, query: measurementQuerySchema }), deviceController.measurements);

router.post('/', adminOnly, validate({ body: deviceBodySchema }), deviceController.create);
router.put('/:id', adminOnly, validate({ params: idParamSchema, body: deviceBodySchema }), deviceController.update);
router.delete('/:id', adminOnly, validate({ params: idParamSchema }), deviceController.remove);
router.post('/:id/check', adminOnly, validate({ params: idParamSchema }), deviceController.checkNow);

export default router;
