// =============================================================================
// Testes do token JWT (lib/jwt.js e middlewares/auth.js). Rodar: npm test
// =============================================================================
import './helpers/env.js'; // primeiro: define o ambiente de teste
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import jwt from 'jsonwebtoken';

const { signToken, verifyToken } = await import('../src/lib/jwt.js');

describe('conteúdo do token', () => {
    test('leva só o id do usuário (sub) e as datas; o perfil não vai no token', () => {
        const token = signToken({ id: 7, role: 'superadmin' });
        const payload = verifyToken(token);
        assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'sub']);
        assert.equal(payload.sub, '7');
        assert.equal(jwt.decode(token, { complete: true }).header.alg, 'HS256');
    });
});
