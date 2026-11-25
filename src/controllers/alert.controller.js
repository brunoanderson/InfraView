// Controller de alertas: lista e reconhecimento.
import * as alertModel from '../models/alert.model.js';
import * as alertService from '../services/alert.service.js';

/** GET /api/alerts?status=&severity=&kind= (counts = totais por status, para os badges) */
export function list(req, res) {
    res.json({ alerts: alertModel.list(req.validated.query), counts: alertModel.countByStatus() });
}

/** PATCH /api/alerts/:id/ack (admin e super admin) */
export function acknowledge(req, res) {
    res.json({ alert: alertService.acknowledge(req.validated.params.id, req.user) });
}
