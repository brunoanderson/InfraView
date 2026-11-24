// Controllers de usuários (só admin): leem req.validated e montam a resposta.
import * as userService from '../services/user.service.js';

/** GET /api/users */
export function list(req, res) {
    res.json({ users: userService.list() });
}

/** PATCH /api/users/:id { role?, password? } */
export async function update(req, res) {
    res.json({ user: await userService.update(req.validated.params.id, req.validated.body, req.user.id) });
}

/** DELETE /api/users/:id -> 204 sem corpo */
export function remove(req, res) {
    userService.remove(req.validated.params.id, req.user.id);
    res.status(204).end();
}
