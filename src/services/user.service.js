// =============================================================================
// Gestão de usuários pelo admin: listar, criar, editar nome, e-mail, perfil e
// senha, e excluir.
//
// Regras (409): o sistema nunca fica sem administrador, e um admin não exclui
// nem rebaixa a si mesmo (nome e e-mail da própria conta podem mudar). A
// conferência e a mudança rodam na mesma transação, então dois pedidos ao mesmo
// tempo não conseguem tirar o último admin. E-mail já usado por outra conta
// esbarra no UNIQUE do banco, que o errorHandler converte no mesmo 409 do cadastro.
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

/** Cria a conta com o perfil escolhido pelo admin. Devolve o usuário (sem o hash). */
export async function create({ name, email, password, role }) {
    const passwordHash = await hashPassword(password);
    return userModel.create({ name, email, passwordHash, role });
}

/** Troca nome, e-mail, perfil e/ou senha, tudo ou nada. Devolve o usuário atualizado. */
export async function update(id, { name, email, role, password }, actingUserId) {
    // o bcrypt é lento (assíncrono): o hash sai antes da transação
    const passwordHash = password === undefined ? undefined : await hashPassword(password);
    getDb().transaction(() => {
        const target = findOrFail(id);
        if (role === 'viewer') assertCanLoseAdmin(target, actingUserId, 'rebaixar');
        if (name !== undefined || email !== undefined) userModel.updateProfile(id, { name, email });
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
