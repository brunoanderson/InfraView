// =============================================================================
// Máquina de estados do dispositivo: dado o estado atual e o resultado de UMA
// verificação, decide o novo estado e o que aconteceu (as "transições").
//
// É uma função PURA: não acessa rede, banco nem relógio. Recebe dados e devolve
// dados. Por isso dá para testar todos os cenários sem ligar nada.
//
// Estados:  pendente (nunca verificado) | online | atencao | offline
//
// Regras:
//   * Falha total (nenhuma tentativa respondeu): soma 1 em consecutiveFailures.
//     Só vira offline quando chega ao limiar (ex.: 3 falhas SEGUIDAS). Antes
//     disso, mantém o estado: um pacote perdido não pode gerar alarme (é o que
//     evita o "flapping").
//   * Sucesso (pelo menos uma tentativa respondeu): zera as falhas e volta na
//     hora. Fica em "atencao" se QUALQUER um dos problemas estiver acima do limite:
//       - latência: média das últimas 3 medições acima do limite do dispositivo;
//       - perda: perda acumulada das últimas 3 verificações com resposta
//         (12 tentativas) acima do limite. Perda parcial não derruba: só deixa
//         em atenção. (Falha total não entra nessa conta: ela já é queda.)
//     (Usar várias medições evita que um único pico isolado gere alerta.)
//
// Transições devolvidas (o monitor transforma cada uma em eventos e alertas):
//   'offline'       caiu agora          -> abre queda + alerta
//   'back_online'   voltou agora        -> fecha queda + resolve alerta
//   'latency_high'  latência passou     -> abre pico + alerta
//   'latency_ok'    latência normalizou -> fecha pico + resolve alerta
//   'loss_high'     perda passou        -> abre evento de perda + alerta
//   'loss_ok'       perda normalizou    -> fecha evento de perda + resolve alerta
// =============================================================================

/**
 * @param {{ status: string, consecutiveFailures: number, latencyThresholdMs: number, lossThresholdPct?: number }} device
 * @param {{ success: boolean }} result  resultado da verificação
 * @param {object} options
 * @param {number}   options.failureThreshold  falhas seguidas até offline
 * @param {number[]} [options.recentLatencies] últimas latências com sucesso, INCLUINDO a atual
 * @param {{ sent: number, lost: number }} [options.recentLoss] tentativas das últimas 3 verificações com resposta, incluindo a atual
 * @param {{ latency: boolean, loss: boolean }} [options.active] problemas que já estão abertos.
 *        Se não vier, "atencao" é tratado como latência (comportamento anterior à perda de pacotes).
 */
export function nextState(device, result, { failureThreshold, recentLatencies = [], recentLoss = null, active } = {}) {
    const open = active ?? { latency: device.status === 'atencao', loss: false };
    const transitions = [];

    if (!result.success) {
        const consecutiveFailures = device.consecutiveFailures + 1;
        const confirmedDown = consecutiveFailures >= failureThreshold;

        if (confirmedDown && device.status !== 'offline') {
            // Problemas de latência/perda abertos são encerrados: agora é queda.
            if (open.latency) transitions.push('latency_ok');
            if (open.loss) transitions.push('loss_ok');
            transitions.push('offline');
            return { status: 'offline', consecutiveFailures, averageLatencyMs: null, lossPct: null, slow: false, lossy: false, transitions };
        }
        // Ainda não confirmou a queda (ou já estava offline): estado não muda.
        return {
            status: device.status, consecutiveFailures, averageLatencyMs: null, lossPct: null,
            slow: open.latency, lossy: open.loss, transitions,
        };
    }

    const averageLatencyMs = average(recentLatencies);
    const slow = averageLatencyMs !== null && averageLatencyMs > device.latencyThresholdMs;

    const lossPct = recentLoss && recentLoss.sent > 0 ? Math.round((recentLoss.lost / recentLoss.sent) * 100) : 0;
    const lossy = device.lossThresholdPct !== undefined && lossPct > device.lossThresholdPct;

    const status = slow || lossy ? 'atencao' : 'online';

    if (device.status === 'offline') transitions.push('back_online');
    if (slow && !open.latency) transitions.push('latency_high');
    if (!slow && open.latency) transitions.push('latency_ok');
    if (lossy && !open.loss) transitions.push('loss_high');
    if (!lossy && open.loss) transitions.push('loss_ok');

    return { status, consecutiveFailures: 0, averageLatencyMs, lossPct, slow, lossy, transitions };
}

function average(values) {
    const numbers = values.filter((v) => typeof v === 'number');
    if (numbers.length === 0) return null;
    return Math.round(numbers.reduce((sum, v) => sum + v, 0) / numbers.length);
}
