// =============================================================================
// Hash de senha com bcrypt (bcryptjs, implementação em JS puro).
//
// O bcrypt gera um "salt" aleatório e o guarda dentro do próprio hash, então a
// mesma senha produz hashes diferentes a cada cadastro. O custo (SALT_ROUNDS)
// deixa cada tentativa propositalmente lenta, o que atrapalha ataques de força bruta.
// A senha em texto puro nunca é guardada no banco.
// =============================================================================
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/** Gera o hash que vai para users.password_hash. */
export function hashPassword(plain) {
    return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Compara a senha digitada com o hash salvo. */
export function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}
