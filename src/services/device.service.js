// =============================================================================
// Regras de negócio dos dispositivos: liga o CRUD ao monitor.
//   * cadastrar  -> grava e já faz a 1ª verificação (o 201 volta com o status medido)
//   * editar     -> se trocou o alvo (host/tipo/porta), recomeça do zero e verifica de novo
//   * pausar     -> fecha queda/pico abertos e resolve os alertas ("monitoramento pausado")
//   * religar    -> volta para pendente e verifica
// =============================================================================
import { AppError } from '../errors/AppError.js';
import { getDb } from '../lib/db.js';
import * as categoryModel from '../models/category.model.js';
import * as deviceModel from '../models/device.model.js';
import * as monitorModel from '../models/monitor.model.js';
import * as monitor from '../monitor/monitor.js';

function findOrFail(id) {
    const device = deviceModel.findById(id);
    if (!device) throw AppError.notFound('Dispositivo não encontrado.');
    return device;
}

/** A categoria precisa existir (a FK também garantiria, mas assim a mensagem é clara). */
function assertCategoryExists(categoryId) {
    if (!categoryModel.exists(categoryId)) {
        throw AppError.validation([{ field: 'categoryId', message: 'Categoria não encontrada.' }]);
    }
}

export const list = (filters) => deviceModel.list(filters);
export const findById = (id) => findOrFail(id);

/** Últimas verificações do dispositivo (404 se ele não existir). */
export function measurements(id, limit) {
    findOrFail(id);
    return monitorModel.recentChecks(id, limit);
}

export async function create(data) {
    assertCategoryExists(data.categoryId);
    const id = deviceModel.create(data);
    // Primeira verificação na hora. Leva no máximo MONITOR_TIMEOUT_MS.
    if (data.monitoringEnabled) await monitor.checkDevice(id);
    return deviceModel.findById(id);
}

export async function update(id, data) {
    const before = findOrFail(id);
    assertCategoryExists(data.categoryId);

    const targetChanged =
        before.host.toLowerCase() !== data.host.toLowerCase() ||
        before.checkType !== data.checkType ||
        before.port !== data.port;
    const paused = before.monitoringEnabled && !data.monitoringEnabled;
    const resumed = !before.monitoringEnabled && data.monitoringEnabled;

    // Configuração + encerramento do que estava aberto: tudo ou nada.
    getDb().transaction(() => {
        deviceModel.update(id, data);
        if (paused) monitor.resetMonitoring(id, 'Monitoramento pausado');
        else if (resumed) monitor.resetMonitoring(id, 'Monitoramento religado');
        else if (targetChanged && data.monitoringEnabled) monitor.resetMonitoring(id, 'Alvo alterado');
    })();

    if (data.monitoringEnabled && (resumed || targetChanged)) await monitor.checkDevice(id);
    return deviceModel.findById(id);
}

export function remove(id) {
    if (deviceModel.remove(id) === 0) throw AppError.notFound('Dispositivo não encontrado.');
}

/** "Verificar agora". checked = false se uma verificação desse dispositivo já estava em andamento. */
export async function checkNow(id) {
    const device = findOrFail(id);
    if (!device.monitoringEnabled) {
        throw AppError.conflict('O monitoramento deste dispositivo está pausado. Religue-o para verificar.');
    }
    const result = await monitor.checkDevice(id);
    return { device: deviceModel.findById(id), checked: result !== null };
}
