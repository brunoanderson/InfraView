// =============================================================================
// Tradução de erros do SQLite (better-sqlite3) em AppError.
//
// O banco é a última linha de defesa: mesmo que a validação deixe passar algo,
// UNIQUE, FOREIGN KEY e CHECK recusam o dado. Aqui o código técnico do SQLite
// vira uma resposta HTTP compreensível:
//   SQLITE_CONSTRAINT_UNIQUE      -> 409 (ex.: e-mail ou nome já cadastrado)
//   SQLITE_CONSTRAINT_FOREIGNKEY  -> 409 (registro relacionado impede a operação)
//   SQLITE_CONSTRAINT_CHECK/NOTNULL -> 400 (valor fora do permitido)
//   banco travado por outra conexão (SQLITE_BUSY) -> 503, "tente de novo"
//   banco ausente, sem tabelas ou corrompido       -> 503, "rode npm run db:reset"
//   banco sem colunas novas (migration pendente)   -> 503, "rode npm run db:migrate"
// =============================================================================
import { AppError } from './AppError.js';

/**
 * Mensagem e campos de cada restrição UNIQUE. A chave é o que o SQLite escreve
 * depois de "UNIQUE constraint failed: " ("tabela.coluna" ou "index 'nome'").
 */
const UNIQUE_MESSAGES = {
    'users.email': { message: 'Já existe uma conta com este e-mail.', fields: ['email'] },
    'devices.name': { message: 'Já existe um dispositivo com este nome.', fields: ['name'] },
    "index 'idx_devices_target'": {
        message: 'Este host já é monitorado com o mesmo tipo de verificação e porta.',
        fields: ['host', 'checkType', 'port'],
    },
    'categories.name': { message: 'Já existe uma categoria com este nome.', fields: ['name'] },
    'categories.slug': { message: 'Já existe uma categoria com este identificador.', fields: ['slug'] },
};

/** Códigos que indicam banco inacessível (não é culpa da requisição). */
const UNAVAILABLE_CODES = new Set([
    'SQLITE_CANTOPEN', 'SQLITE_LOCKED', 'SQLITE_IOERR',
    'SQLITE_CORRUPT', 'SQLITE_NOTADB', 'SQLITE_FULL', 'SQLITE_READONLY',
]);

/** "UNIQUE constraint failed: devices.name" -> "devices.name" */
function uniqueTarget(message) {
    return (/constraint failed: (.+)$/.exec(message) ?? [])[1]?.trim() ?? '';
}

/**
 * Converte um erro do SQLite em AppError. Devolve null se não for erro do SQLite.
 * @param {Error & { code?: string }} err
 */
export function fromDatabaseError(err) {
    const code = typeof err?.code === 'string' ? err.code : '';
    if (!code.startsWith('SQLITE')) return null;

    if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
        const known = UNIQUE_MESSAGES[uniqueTarget(err.message)];
        return known
            ? AppError.conflict(known.message, { fields: known.fields })
            : AppError.conflict('Já existe um registro com estes dados.');
    }

    if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return AppError.conflict(
            'A operação viola um relacionamento: o registro relacionado não existe ou ainda está em uso.',
        );
    }

    if (code === 'SQLITE_CONSTRAINT_CHECK' || code === 'SQLITE_CONSTRAINT_NOTNULL') {
        return AppError.badRequest('Um dos valores enviados não é permitido.');
    }

    // Travado por outra conexão (ex.: alguém com o arquivo aberto gravando):
    // é passageiro, então a dica do db:reset não serve aqui.
    if (code.startsWith('SQLITE_BUSY')) {
        return AppError.serviceUnavailable(
            'Banco de dados temporariamente indisponível. Tente novamente em instantes.',
            'DATABASE_UNAVAILABLE',
        );
    }

    // "no such column": o banco existe, mas está numa versão anterior à do código.
    if (/no such column/i.test(err.message)) return databaseOutdated();

    // "no such table": o banco existe mas as migrations não foram aplicadas.
    if (UNAVAILABLE_CODES.has(code.split('_').slice(0, 2).join('_')) || /no such table/i.test(err.message)) {
        return databaseUnavailable();
    }

    return null; // outros erros do SQLite são bugs: viram 500 no errorHandler
}

/** 503 para banco ausente ou sem tabelas: a solução é recriá-lo. */
export function databaseUnavailable() {
    return AppError.serviceUnavailable(
        'Banco de dados indisponível. Verifique se ele foi criado (npm run db:reset).',
        'DATABASE_UNAVAILABLE',
    );
}

/** 503 para banco com migrations pendentes: a solução é aplicá-las, sem perder dados. */
export function databaseOutdated() {
    return AppError.serviceUnavailable(
        'Banco de dados desatualizado. Rode "npm run db:migrate" e tente de novo.',
        'DATABASE_OUTDATED',
    );
}
