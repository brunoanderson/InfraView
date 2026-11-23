// =============================================================================
// Regras de negócio da autenticação (entre o controller e o model).
// =============================================================================
import { AppError } from '../errors/AppError.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { signToken } from '../lib/jwt.js';
import * as userModel from '../models/user.model.js';

// Hash de uma senha qualquer, usado quando o e-mail não existe (veja login()).
const DUMMY_HASH = await hashPassword('senha-inexistente-para-tempo-constante');

/** Cadastro público: sempre cria "viewer". Devolve o usuário e já um token. */
export async function register({ name, email, password }) {
    const passwordHash = await hashPassword(password);
    const user = userModel.create({ name, email, passwordHash, role: 'viewer' });
    return { user, token: signToken(user) };
}

/**
 * Login. A mensagem de erro é a mesma para "e-mail não existe" e "senha errada",
 * e o bcrypt roda nos dois casos (com DUMMY_HASH quando não há usuário). Assim
 * nem o texto nem o tempo de resposta revelam quais e-mails estão cadastrados.
 */
export async function login({ email, password }) {
    const found = userModel.findByEmailWithHash(email);
    const passwordOk = await verifyPassword(password, found?.passwordHash ?? DUMMY_HASH);

    if (!found || !passwordOk) {
        throw AppError.unauthorized('E-mail ou senha inválidos.', 'INVALID_CREDENTIALS');
    }

    const { passwordHash, ...user } = found; // o hash nunca sai daqui
    return { user, token: signToken(user) };
}
