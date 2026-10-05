/**
 * scripts/dev.mjs
 * ------------------------------------------------------------------
 * Sobe, com um único comando (npm start), os dois servidores do projeto:
 *
 *   API  -> JSON Server  em http://localhost:3000  (db.json)
 *   WEB  -> http-server  em http://localhost:8080  (HTML/CSS/JS)
 *
 * O front-end PRECISA ser servido por HTTP (módulos ES não funcionam
 * abrindo o arquivo direto via file://). Servimos o front numa porta e
 * a API em outra; o JSON Server já libera CORS por padrão.
 *
 * Não usa dependências extras: apenas o Node e os binários instalados
 * pelo "npm install". Ctrl+C encerra os dois processos.
 * ------------------------------------------------------------------
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA_API = '3000';
const PORTA_WEB = '8080';

const servicos = [
    {
        nome: 'API',
        cor: '\x1b[36m',
        binario: path.join(raiz, 'node_modules', 'json-server', 'lib', 'bin.js'),
        args: ['db.json', '--port', PORTA_API],
    },
    {
        nome: 'WEB',
        cor: '\x1b[32m',
        binario: path.join(raiz, 'node_modules', 'http-server', 'bin', 'http-server'),
        args: ['.', '-p', PORTA_WEB, '-c-1'],
    },
];

if (servicos.some((s) => !existsSync(s.binario))) {
    console.error('Dependências não encontradas. Rode primeiro:  npm install');
    process.exit(1);
}

const RESET = '\x1b[0m';
const filhos = [];
let encerrando = false;

function encerrarTudo(codigo = 0) {
    if (encerrando) {
        return;
    }
    encerrando = true;
    filhos.forEach((filho) => filho.kill());
    setTimeout(() => process.exit(codigo), 200);
}

function prefixar(servico, texto) {
    texto
        .toString()
        .split('\n')
        .filter((linha) => linha.trim() !== '')
        .forEach((linha) => console.log(`${servico.cor}[${servico.nome}]${RESET} ${linha}`));
}

servicos.forEach((servico) => {
    const filho = spawn(process.execPath, [servico.binario, ...servico.args], { cwd: raiz });
    filho.stdout.on('data', (dados) => prefixar(servico, dados));
    filho.stderr.on('data', (dados) => prefixar(servico, dados));
    filho.on('exit', (codigo) => {
        if (!encerrando) {
            console.error(`[${servico.nome}] encerrou inesperadamente (código ${codigo}). Verifique se a porta já está em uso.`);
            encerrarTudo(codigo || 1);
        }
    });
    filhos.push(filho);
});

setTimeout(() => {
    console.log('\n  InfraView no ar:');
    console.log(`    Abra no navegador:  http://localhost:${PORTA_WEB}`);
    console.log(`    API (JSON Server):  http://localhost:${PORTA_API}`);
    console.log('    Ctrl+C para encerrar\n');
}, 1500);

process.on('SIGINT', () => encerrarTudo(0));
process.on('SIGTERM', () => encerrarTudo(0));
