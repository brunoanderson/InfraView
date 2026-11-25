// Controllers de dispositivos: leem req.validated e montam a resposta.
import * as deviceService from '../services/device.service.js';

/** GET /api/devices?status=&search=&categoryId= */
export function list(req, res) {
    res.json({ devices: deviceService.list(req.validated.query) });
}

/** GET /api/devices/:id */
export function show(req, res) {
    res.json({ device: deviceService.findById(req.validated.params.id) });
}

/** GET /api/devices/measurements?limit= (últimas verificações de cada dispositivo, num objeto por id) */
export function measurementsOfAll(req, res) {
    res.json({ measurements: deviceService.measurementsOfAll(req.validated.query.limit) });
}

/** GET /api/devices/:id/measurements?limit= (últimas verificações, da mais antiga para a mais nova) */
export function measurements(req, res) {
    res.json({ measurements: deviceService.measurements(req.validated.params.id, req.validated.query.limit) });
}

/** POST /api/devices (admin e super admin) -> 201 com o status já medido */
export async function create(req, res) {
    const device = await deviceService.create(req.validated.body);
    res.status(201).location(`/api/devices/${device.id}`).json({ device });
}

/** PUT /api/devices/:id (admin e super admin) */
export async function update(req, res) {
    res.json({ device: await deviceService.update(req.validated.params.id, req.validated.body) });
}

/** DELETE /api/devices/:id (admin e super admin) -> 204 sem corpo */
export function remove(req, res) {
    deviceService.remove(req.validated.params.id);
    res.status(204).end();
}

/** POST /api/devices/:id/check (admin e super admin): "verificar agora" */
export async function checkNow(req, res) {
    res.json(await deviceService.checkNow(req.validated.params.id));
}
