// =============================================================================
// Monta a aplicação Express. A ORDEM dos middlewares importa:
//   1. helmet          -> cabeçalhos de segurança (inclusive Content-Security-Policy)
//   2. cors            -> só as origens de CORS_ORIGIN podem chamar a API de outro site
//   3. express.json    -> lê o corpo JSON, com limite de tamanho
//   4. static          -> serve o front-end (public/) na mesma origem da API
//   5. rotas /api
//   6. notFound        -> nenhuma rota atendeu: 404
//   7. errorHandler    -> qualquer erro de cima vira resposta HTTP padronizada
//
// createApp() não abre porta nem banco: quem faz isso é o server.js. Assim os
// testes podem usar o app direto com o supertest.
// =============================================================================
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env, ROOT_DIR } from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import apiRoutes from './routes/index.js';

export function createApp() {
    const app = express();

    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    // Bootstrap e Bootstrap Icons vêm do CDN jsDelivr; o resto é nosso.
                    // Sem 'unsafe-inline' em scripts: nada de <script> inline nem onclick="".
                    'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
                    'style-src': ["'self'", 'https://cdn.jsdelivr.net'],
                    'font-src': ["'self'", 'https://cdn.jsdelivr.net'],
                    'img-src': ["'self'", 'data:'], // o CSS do Bootstrap usa ícones SVG em data:
                    'connect-src': ["'self'"],
                    // O app roda em http://localhost (sem HTTPS): forçar https quebraria o carregamento.
                    'upgrade-insecure-requests': null,
                },
            },
        }),
    );

    // O front é servido pelo próprio Express (mesma origem), então o navegador
    // nem precisa de CORS para ele. A regra vale para outras origens: só as
    // listadas em CORS_ORIGIN recebem permissão; as demais são barradas pelo navegador.
    app.use(
        '/api',
        cors({
            origin: env.CORS_ORIGIN,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        }),
    );

    app.use(express.json({ limit: '10kb' }));

    app.use(express.static(path.join(ROOT_DIR, 'public'), { extensions: ['html'] }));

    app.use('/api', apiRoutes);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}
