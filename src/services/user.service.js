// =============================================================================
// Gestão de usuários pelo admin: listar, trocar perfil, redefinir senha, excluir.
//
// Regras (409): o sistema nunca fica sem administrador, e um admin não exclui
// nem rebaixa a si mesmo. A conferência e a mudança rodam na mesma transação,
// então dois pedidos ao mesmo tempo não conseguem tirar o último admin.
// =============================================================================
import { AppError } from '../errors/AppError.js';
import { getDb } from '../lib/db.js';
import { hashPassword } from '../lib/password.js';
import * as userModel from '../models/user.model.js';

export const list = () => userModel.list();

function findOrFail(id) {
    const user = userModel.findById(id);
    if (!user) throw AppError.notFound('Usuário não encontrado.');
    return user;
}

/**
 * Confere se o admin pode deixar de ser admin (rebaixado ou excluído).
 * O último admin é conferido primeiro: só ele pode ser o próprio usuário logado.
 */
function assertCanLoseAdmin(target, actingUserId, action) {
    if (target.role === 'admin' && userModel.countAdmins() === 1) {
        throw AppError.conflict(`Não é possível ${action} o único administrador. Promova outro usuário antes.`);
    }
    if (target.id === actingUserId) {
        throw AppError.conflict(`Você não pode ${action} a sua própria conta.`);
    }
}

/** Troca o perfil e/ou a senha. Devolve o usuário atualizado. */
export async function update(id, { role, password }, actingUserId) {
    // o bcrypt é lento (assíncrono): o hash sai antes da transação
    const passwordHash = password === undefined ? undefined : await hashPassword(password);
    getDb().transaction(() => {
        const target = findOrFail(id);
        if (role === 'viewer') assertCanLoseAdmin(target, actingUserId, 'rebaixar');
        if (role !== undefined) userModel.updateRole(id, role);
        if (passwordHash !== undefined) userModel.updatePasswordHash(id, passwordHash);
    })();
    return userModel.findById(id);
}

export function remove(id, actingUserId) {
    getDb().transaction(() => {
        const target = findOrFail(id);
        assertCanLoseAdmin(target, actingUserId, 'excluir');
        userModel.remove(id);
    })();
}
