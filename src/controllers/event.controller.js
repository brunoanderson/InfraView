// Controller dos eventos (tela Relatórios): quedas, picos de latência e perda de pacotes.
import * as eventService from '../services/event.service.js';

/** GET /api/events?type=todos|downtime|latencia|perda&period=0|7|30|all&device=<id> */
export function list(req, res) {
    res.json(eventService.list(req.validated.query));
}
