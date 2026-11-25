// Controller de alertas: lista e reconhecimento.
import * as alertService from '../services/alert.service.js';

/** GET /api/alerts?status=&severity=&kind= (counts = totais por status, para os badges) */
export function list(req, res) {
    res.json(alertService.list(req.validated.query));
}

/** PATCH /api/alerts/:id/ack (admin e super admin) */
export function acknowledge(req, res) {
    res.json({ alert: alertService.acknowledge(req.validated.params.id, req.user) });
}
