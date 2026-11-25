// Alertas: a lista da tela (com os totais por status) e as regras do botão
// "Reconhecer": só alerta ativo, e só uma vez.
import { AppError } from '../errors/AppError.js';
import * as alertModel from '../models/alert.model.js';

/** Alertas filtrados + totais por status (os badges da tela não dependem dos filtros). */
export function list(filters) {
    return { alerts: alertModel.list(filters), counts: alertModel.countByStatus() };
}

export function acknowledge(alertId, user) {
    const alert = alertModel.findById(alertId);
    if (!alert) throw AppError.notFound('Alerta não encontrado.');
    if (alert.status !== 'ativo') throw AppError.conflict('Só alertas ativos podem ser reconhecidos.');
    if (alert.acknowledgedAt) {
        throw AppError.conflict(`Este alerta já foi reconhecido por ${alert.acknowledgedBy?.name ?? 'outro usuário'}.`);
    }

    // O WHERE do model repete as condições: se dois admins clicarem ao mesmo tempo, só um grava.
    if (alertModel.acknowledge(alertId, user.id, new Date().toISOString()) === 0) {
        throw AppError.conflict('O alerta mudou enquanto você o reconhecia. Atualize a página.');
    }
    return alertModel.findById(alertId);
}
