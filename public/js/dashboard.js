// Dashboard: exige login e monta o layout. Os indicadores entram na próxima etapa.
import { initPage } from './layout.js';
import { toast } from './ui.js';

const user = await initPage('dashboard');

// Recém-cadastrado (o cadastro manda ?bemvindo=1): avisa como a conta foi criada
// e limpa o parâmetro da barra de endereço.
if (new URLSearchParams(window.location.search).has('bemvindo')) {
    toast(`Conta criada. Bem-vindo(a), ${user.name}! Você entrou como visualizador.`, 'success');
    window.history.replaceState(null, '', 'dashboard.html');
}
