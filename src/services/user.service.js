// =============================================================================
// Gestão de usuários pelo super admin: listar, criar, editar nome, e-mail,
// perfil e senha, e excluir.
//
// Regras, conferidas nesta ordem (depois do 404):
//   1. Conta raiz: nunca é excluída nem tem nome, e-mail ou perfil alterados
//      (409). A senha dela só o próprio raiz troca (403 para os demais).
//   2. Própria conta: ninguém rebaixa nem exclui a si mesmo (409). Nome, e-mail
//      e senha da própria conta podem mudar.
// Como a raiz sempre existe e é sempre super admin, o sistema nunca fica sem
// quem gerencie os usuários. As alterações de uma requisição rodam numa
// transação: ou entram todas, ou nenhuma. E-mail já usado por outra conta
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

/** Cria a conta com o perfil escolhido. Devolve o usuário (sem o hash). */
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
        if (target.isRoot) {
            if (name !== undefined || email !== undefined || role !== undefined) {
                throw AppError.conflict('A conta do super admin raiz só permite trocar a senha.');
            }
            if (target.id !== actingUserId) {
                throw AppError.forbidden('Só o próprio super admin raiz pode trocar a senha dessa conta.');
            }
        }
        if (target.id === actingUserId && role !== undefined && role !== target.role) {
            throw AppError.conflict('Você não pode rebaixar a sua própria conta.');
        }
        if (name !== undefined || email !== undefined) userModel.updateProfile(id, { name, email });
        if (role !== undefined) userModel.updateRole(id, role);
        if (passwordHash !== undefined) userModel.updatePasswordHash(id, passwordHash);
    })();
    return userModel.findById(id);
}

export function remove(id, actingUserId) {
    getDb().transaction(() => {
        const target = findOrFail(id);
        if (target.isRoot) throw AppError.conflict('A conta do super admin raiz não pode ser excluída.');
        if (target.id === actingUserId) throw AppError.conflict('Você não pode excluir a sua própria conta.');
        userModel.remove(id);
    })();
}
