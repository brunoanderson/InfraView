// Rota "/": quem já tem sessão vai para o dashboard; quem não tem, para o login.
// (Se o token estiver vencido, o dashboard recebe 401 e manda para o login.)
import { getToken } from './auth.js';

window.location.replace(getToken() ? '/dashboard.html' : '/login.html');
