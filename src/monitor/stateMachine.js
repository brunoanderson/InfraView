// =============================================================================
// Máquina de estados do dispositivo: dado o estado atual e o resultado de UMA
// verificação, decide o novo estado e o que aconteceu (as "transições").
//
// É uma função PURA: não acessa rede, banco nem relógio. Recebe dados e devolve
// dados. Por isso dá para testar todos os cenários sem ligar nada.
//
// Estados:  pendente (nunca verificado) | online | atencao (latência alta) | offline
//
// Regras:
//   * Falha: soma 1 em consecutiveFailures. Só vira offline quando chega ao
//     limiar (ex.: 3 falhas SEGUIDAS). Antes disso, mantém o estado: um pacote
//     perdido não pode gerar alarme (é o que evita o "flapping").
//   * Sucesso: zera as falhas e volta na hora. Se a MÉDIA das últimas medições
//     passar do limite do dispositivo, fica em atencao; senão, online.
//     (A média evita que um único pico isolado gere alerta.)
//
// Transições devolvidas (o monitor transforma cada uma em eventos e alertas):
//   'offline'       caiu agora          -> abre queda + alerta
//   'back_online'   voltou agora        -> fecha queda + resolve alerta
//   'latency_high'  latência passou     -> abre pico + alerta
//   'latency_ok'    latência normalizou -> fecha pico + resolve alerta
// =============================================================================

/**
 * @param {{ status: string, consecutiveFailures: number, latencyThresholdMs: number }} device
 * @param {{ success: boolean }} result  resultado da verificação
 * @param {{ failureThreshold: number, recentLatencies: number[] }} options
 *        recentLatencies = últimas latências com sucesso, INCLUINDO a atual
 * @returns {{ status: string, consecutiveFailures: number, averageLatencyMs: number|null, transitions: string[] }}
 */
export function nextState(device, result, { failureThreshold, recentLatencies = [] }) {
    const transitions = [];

    if (!result.success) {
        const consecutiveFailures = device.consecutiveFailures + 1;
        const confirmedDown = consecutiveFailures >= failureThreshold;

        if (confirmedDown && device.status !== 'offline') {
            // Se estava com latência alta, esse problema é encerrado: agora é queda.
            if (device.status === 'atencao') transitions.push('latency_ok');
            transitions.push('offline');
            return { status: 'offline', consecutiveFailures, averageLatencyMs: null, transitions };
        }
        // Ainda não confirmou a queda (ou já estava offline): estado não muda.
        return { status: device.status, consecutiveFailures, averageLatencyMs: null, transitions };
    }

    const averageLatencyMs = average(recentLatencies);
    const slow = averageLatencyMs !== null && averageLatencyMs > device.latencyThresholdMs;
    const status = slow ? 'atencao' : 'online';

    if (device.status === 'offline') transitions.push('back_online');
    if (slow && device.status !== 'atencao') transitions.push('latency_high');
    if (!slow && device.status === 'atencao') transitions.push('latency_ok');

    return { status, consecutiveFailures: 0, averageLatencyMs, transitions };
}

function average(values) {
    const numbers = values.filter((v) => typeof v === 'number');
    if (numbers.length === 0) return null;
    return Math.round(numbers.reduce((sum, v) => sum + v, 0) / numbers.length);
}
