<p align="center"><img src="InfraView.png" alt="InfraView: monitoramento de infraestrutura de redes" width="420"></p>

# InfraView

O InfraView é um painel de monitoramento, no estilo de um NOC, para os dispositivos de uma rede local:
roteador, access points, câmeras, inversor solar, servidores e o que mais tiver IP.

Ele **verifica os dispositivos de verdade**, sozinho, a cada intervalo configurado, por **ping**, por
**conexão TCP** numa porta ou por **requisição HTTP**. Com o resultado, mantém o status de cada um
(online, atenção, offline ou pendente) e gera eventos e alertas automaticamente em três situações:

- **queda**: o dispositivo não respondeu em várias verificações seguidas (3, por padrão);
- **latência alta**: a média das últimas 3 medições passou do limite do dispositivo;
- **perda de pacotes**: a perda nas últimas 3 verificações passou do limite do dispositivo.

Quando o problema acaba, o evento é fechado e o alerta é resolvido, também automaticamente.

Projeto 1.2 (Back-end) do IFPB. Grupo: Vinícius Ribeiro Maia, Bruno Anderson e Arthur Rodrigues.

**Tecnologias:** Node.js, Express 5, SQLite com better-sqlite3 (SQL escrito à mão, sem ORM), zod
(validação), bcryptjs (hash de senha), jsonwebtoken (JWT), helmet e express-rate-limit. O front-end é
HTML, CSS (Bootstrap) e JavaScript puro, servido pelo próprio Express a partir da pasta `public/`.

---

## Requisitos

- **Node.js 20 ou mais novo**. O projeto foi testado com o Node 24.
- npm, que já vem com o Node.
- Para a verificação por ping: o comando `ping` do sistema, que existe no Windows, no Linux e no macOS.

## Instalação

```bash
git clone <endereço do repositório>
cd InfraView
npm install
```

As versões mais novas do npm podem avisar que bloquearam o script de instalação do `better-sqlite3`
("install scripts blocked"). Pode ignorar o aviso: o pacote já traz o módulo pronto para Windows,
Linux e macOS, e o banco funciona sem esse script.

## Configuração (.env)

As configurações ficam num arquivo `.env` na raiz do projeto. Ele **não vai para o Git**, porque
guarda o segredo do JWT. Crie o seu a partir do modelo:

```bash
cp .env.example .env                  # Linux, macOS ou Git Bash
Copy-Item .env.example .env           # PowerShell (Windows)
```

O `JWT_SECRET` do modelo serve para desenvolvimento e demonstração. Só é preciso trocá-lo ao publicar a
aplicação: aí ele deve ser um segredo forte e privado, que não aparece em nenhum outro lugar. Este
comando gera um:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

| Variável | Para que serve | Valor no modelo |
|---|---|---|
| `NODE_ENV` | Ambiente: `development`, `production` ou `test` | `development` |
| `PORT` | Porta do servidor | `3000` |
| `DATABASE_URL` | Caminho do arquivo do banco SQLite, relativo à raiz do projeto (**obrigatória**) | `./db/infraview.db` |
| `JWT_SECRET` | Segredo que assina os tokens de login, com no mínimo 32 caracteres (**obrigatória**) | valor de exemplo; troque ao publicar |
| `JWT_EXPIRES_IN` | Validade do login: número + unidade (`30m`, `8h`, `7d`) | `8h` |
| `CORS_ORIGIN` | Endereços que podem chamar a API de outro site, separados por vírgula (**obrigatória**) | `http://localhost:3000` |
| `SEED_ADMIN_NAME` | Nome do super admin raiz criado pelo seed | `Administrador` |
| `SEED_ADMIN_EMAIL` | E-mail de login do super admin raiz | `admin@infraview.local` |
| `SEED_ADMIN_PASSWORD` | Senha do super admin raiz, com no mínimo 8 caracteres | `Admin@123` |
| `MONITOR_ENABLED` | Liga ou desliga o monitoramento automático (`true` ou `false`) | `true` |
| `MONITOR_INTERVAL_SECONDS` | Intervalo entre as rodadas de verificação, de 5 a 3600 s | `30` |
| `MONITOR_TIMEOUT_MS` | Tempo máximo de espera de cada tentativa, de 200 a 10000 ms | `2000` |
| `MONITOR_FAILURE_THRESHOLD` | Verificações seguidas sem resposta até marcar como offline, de 1 a 10 | `3` |

Se alguma variável faltar ou estiver errada, o servidor **não sobe**: ele mostra o nome da variável
e o problema, mas nunca o valor. As variáveis `SEED_ADMIN_*` só são lidas pelos comandos de banco
(`db:seed` e `db:reset`).

> A senha `Admin@123` do modelo é só para demonstração. Troque-a se o sistema for usado de verdade.

## Banco de dados

O banco é um arquivo SQLite. Para criá-lo do zero (com as tabelas, o super admin raiz e as categorias):

```bash
npm run db:reset          # uso real: sem nenhum dispositivo
npm run db:reset:demo     # demonstração: com 6 dispositivos de teste (veja abaixo)
```

O `db:reset` **apaga o banco atual** e o recria. Pare o servidor antes: no Windows, o arquivo fica
bloqueado enquanto o servidor está aberto.

Outros comandos do banco:

| Comando | O que faz |
|---|---|
| `npm run db:migrate` | Aplica só as migrations que faltam (`db/migrations/*.sql`), sem apagar dados |
| `npm run db:seed` | Apaga os dados e insere o super admin raiz e as categorias de novo |
| `npm run db:seed:demo` | O mesmo, mais os 6 dispositivos de demonstração |

As migrations ficam em `db/migrations` e são aplicadas em ordem. A `004_super_admin.sql` cria os três
perfis e a conta raiz: recria a tabela `users` preservando os dados (o perfil passa a aceitar
`superadmin` e entra a coluna `is_root`, com um índice único que permite no máximo uma raiz) e, num
banco que já existia, transforma o admin mais antigo no super admin raiz. Para atualizar um banco
criado antes dela sem perder nada, pare o servidor e rode `npm run db:migrate`.

Se o servidor subir sem o banco, ele continua no ar, mas a API responde `503` com a dica de rodar
`npm run db:reset`. Depois de criar o banco, não precisa reiniciar o servidor.

## Como rodar

```bash
npm run dev      # desenvolvimento: reinicia sozinho ao salvar um arquivo de src/
npm start        # sem reinício automático
```

Abra **http://localhost:3000** (ou a porta definida em `PORT`).

Para rodar em produção, coloque `NODE_ENV=production` no `.env`, ajuste o `CORS_ORIGIN` para o
endereço real do site e use `npm start`.

Para parar, use Ctrl+C. O servidor espera a rodada de verificação em andamento terminar e fecha o
banco antes de sair.

## Testes

```bash
npm test             # roda todos os testes (node --test), com a saída completa
npm run verificar    # roda os mesmos testes e mostra só o resumo
```

O `npm run verificar` mostra o total de testes, quantos passaram e quantos falharam. Se algum falhar,
ele mostra a saída completa e sai com código 1.

Os testes não usam o `.env` nem o banco do projeto: cada arquivo de teste cria um banco em memória.

## Demonstração

A demonstração usa 6 dispositivos que rodam **no próprio computador**. Assim ela funciona em qualquer
rede, até sem internet, e nada é simulado: o monitor mede tudo de verdade.

| Dispositivo | Verificação | O que acontece |
|---|---|---|
| GW-LOCAL | ping em `127.0.0.1` | Sempre online. É o gateway mostrado no dashboard. |
| INFRAVIEW-API | tcp em `localhost`, na porta `PORT` | A própria API: online enquanto o servidor roda. |
| CAM-DEMO | tcp em `127.0.0.1:7010` | Online enquanto o alvo de demonstração roda. |
| INVERSOR-DEMO | http em `127.0.0.1:7011` | O alvo responde em cerca de 350 ms, acima do limite de 200 ms: fica em **atenção por latência alta**. |
| REDE-INSTAVEL-DEMO | http em `127.0.0.1:7012` | O alvo derruba 2 de cada 5 requisições (40%), acima do limite de 20%: fica em **atenção por perda de pacotes**. |
| NAS-FORA | tcp em `127.0.0.1:9` | Porta fechada: cai depois de 3 verificações e gera um alerta crítico. |

O "alvo de demonstração" (`demo/alvo.js`) são três servidores pequenos, nas portas **7010**, **7011**
e **7012**.

**Sobre o intervalo:** uma queda só é confirmada depois de 3 verificações com falha. Com
`MONITOR_INTERVAL_SECONDS=30` (o padrão), isso leva cerca de 1,5 minuto; com `5`, cerca de 15 s.

### Jeito rápido: um terminal só

```bash
npm run demo
```

Esse comando:

1. confere se as portas estão livres (a `PORT` do servidor e as 7010, 7011 e 7012). Se alguma estiver
   ocupada, avisa qual é e para sem mexer no banco;
2. recria o banco com os dados de demonstração (o mesmo que `npm run db:reset:demo`);
3. sobe o alvo de demonstração e o servidor (com o nodemon, como no `npm run dev`).

Com ele rodando, no mesmo terminal:

- **`a` + Enter** derruba o alvo. Depois de 3 verificações, CAM-DEMO, INVERSOR-DEMO e
  REDE-INSTAVEL-DEMO ficam offline e os alertas de queda aparecem. Digite `a` + Enter de novo para
  religar o alvo: na verificação seguinte os dispositivos voltam e os alertas são resolvidos.
- **Ctrl+C** encerra tudo, inclusive os processos filhos. No Windows, o `npm` ainda pergunta
  "Deseja finalizar o arquivo em lotes (S/N)?". Os processos já foram encerrados nesse ponto, então
  tanto faz a resposta.

### Jeito manual: dois terminais

```bash
npm run db:reset:demo     # 1. com o servidor parado
npm run dev               # 2. terminal 1: o servidor
npm run demo:alvo         # 3. terminal 2: o alvo de demonstração
```

Aqui, o Ctrl+C no terminal 2 derruba o alvo (para mostrar as quedas). Rodar `npm run demo:alvo` de
novo faz os dispositivos voltarem.

## Monitorar a rede de verdade

1. Crie o banco sem os dispositivos de demonstração: `npm run db:reset`.
2. Rode `npm start` (ou `npm run dev`) e entre com o super admin raiz.
3. Na tela **Rede**, clique em **Novo dispositivo** e preencha:
   - **host**: o IP (ex.: `192.168.0.1`) ou o nome do aparelho na rede (ex.: `roteador.lan`);
   - **tipo de verificação**:
     - `ping`: o padrão, e não usa porta;
     - `tcp`: tenta conectar numa porta. Use quando o aparelho bloqueia ping (o Firewall do Windows
       bloqueia por padrão). Exemplos: 80 ou 443 na interface web de um roteador, 554 numa câmera
       com RTSP;
     - `http`: faz um GET em `http://host:porta/`. É o único que percebe um servidor lento;
   - **limite de latência** (ms) e **limite de perda** (%): a partir deles o dispositivo fica em
     atenção;
   - **categoria**, e se ele é o **gateway** da rede (o dashboard mostra a disponibilidade dele nas últimas 24 horas).
4. Ao salvar, o dispositivo é verificado na hora. Depois disso, o monitor o verifica a cada
   `MONITOR_INTERVAL_SECONDS`.

Na mesma tela dá para editar, pausar ou retomar o monitoramento, verificar um dispositivo na hora e
excluí-lo. Algumas portas (por exemplo 22, 25 e 554) o Node não deixa usar na verificação `http`.
Para elas, use a `tcp`.

## Usuários e perfis

| Perfil (na API) | Na tela | O que pode fazer |
|---|---|---|
| `superadmin` | Super admin | Tudo o que o admin faz, mais gerenciar os usuários na tela **Usuários** |
| `admin` | Admin | Cadastrar, editar, pausar e excluir dispositivos, pedir "verificar agora" e reconhecer alertas |
| `viewer` | Usuário | Só consultar e buscar: dashboard, rede, alertas e relatórios |

Todos os perfis veem as mesmas telas de consulta. O que muda é o que cada um pode alterar.

**Conta raiz.** O `db:reset` (ou `db:seed`) cria um super admin especial, a conta raiz, com o
`SEED_ADMIN_EMAIL` e a `SEED_ADMIN_PASSWORD` do `.env` (no modelo: `admin@infraview.local` /
`Admin@123`). Ela é imune: ninguém a edita, rebaixa ou exclui, nem ela mesma. A única alteração
permitida é a senha, e só a própria raiz troca a senha dela. Existe sempre exatamente uma raiz, e a
API nunca cria nem promove outra: o campo `is_root` não é aceito em nenhuma requisição.

**Super admins criados.** Qualquer super admin (a raiz ou um criado por ela) cria contas com qualquer
um dos três perfis e gerencia as demais contas, inclusive outros super admins criados: edita nome,
e-mail e perfil, redefine a senha e exclui. A única conta fora do alcance é a raiz.

**Própria conta.** Ninguém rebaixa nem exclui a própria conta. Nome, e-mail e senha da própria conta
podem ser alterados normalmente.

**Cadastro público.** Para criar uma conta com o perfil Usuário, abra
**http://localhost:3000/cadastro.html** (ou clique em "Cadastre-se" na tela de login). Toda conta criada
por essa tela nasce como `viewer`: mesmo que alguém envie `"role": "admin"` para a API, o campo é ignorado.

Quando uma regra é quebrada, a API responde:

| Situação | Resposta |
|---|---|
| Alterar nome, e-mail ou perfil da raiz | `409` "A conta do super admin raiz só permite trocar a senha." |
| Excluir a raiz | `409` "A conta do super admin raiz não pode ser excluída." |
| Outro super admin trocar a senha da raiz | `403` "Só o próprio super admin raiz pode trocar a senha dessa conta." |
| Rebaixar ou excluir a própria conta | `409` "Você não pode rebaixar/excluir a sua própria conta." |
| Admin ou Usuário em qualquer rota de usuários | `403` |

As mudanças valem na hora: a cada requisição a API relê o usuário no banco, então quem foi excluído
recebe `401` e quem foi rebaixado passa a receber `403` nas ações que perdeu, mesmo com o token antigo.
Os alertas reconhecidos por um usuário excluído continuam registrados, como "usuário removido".

A senha precisa ter de 8 a 72 caracteres, com pelo menos uma letra e um número. O login e o cadastro
aceitam no máximo 10 tentativas a cada 15 minutos por IP. A partir daí, a API responde `429`.

## API

Todas as rotas ficam sob `/api` e trocam JSON. Depois do login, envie o token em todas as requisições:

```
Authorization: Bearer <token>
```

| Método e rota | Quem pode | O que faz |
|---|---|---|
| `GET /api/health` | público | Confere se a API e o banco estão no ar |
| `POST /api/auth/register` | público | Cria uma conta viewer: `{ name, email, password }` → `201 { user, token }` |
| `POST /api/auth/login` | público | Login: `{ email, password }` → `200 { user, token }` |
| `GET /api/auth/me` | logado | Dados do usuário dono do token |
| `GET /api/devices` | logado | Lista os dispositivos. Filtros: `?status=online\|offline\|atencao\|pendente&search=&categoryId=` |
| `GET /api/devices/measurements` | logado | Últimas verificações de todos os dispositivos numa requisição só: `{ measurements: { "<id>": [...] } }`, cada lista da mais antiga para a mais nova. `?limit=` de 1 a 120, padrão 30 |
| `GET /api/devices/:id` | logado | Um dispositivo |
| `GET /api/devices/:id/measurements` | logado | Últimas verificações (`checkedAt`, `success`, `latencyMs`, `packetsLost`), da mais antiga para a mais nova. `?limit=` de 1 a 120, padrão 30 |
| `POST /api/devices` | admin, superadmin | Cadastra e já verifica → `201` |
| `PUT /api/devices/:id` | admin, superadmin | Edita |
| `DELETE /api/devices/:id` | admin, superadmin | Exclui → `204` |
| `POST /api/devices/:id/check` | admin, superadmin | Verifica agora |
| `GET /api/categories` | logado | Categorias, com a quantidade de dispositivos |
| `GET /api/dashboard/summary` | logado | Números do dashboard |
| `GET /api/alerts` | logado | Alertas. Filtros: `?status=ativo\|resolvido\|info&severity=critical\|warning\|info&kind=offline\|latency\|loss` |
| `PATCH /api/alerts/:id/ack` | admin, superadmin | Reconhece um alerta ativo |
| `GET /api/events` | logado | Quedas, picos de latência e perdas. Filtros: `?type=todos\|downtime\|latencia\|perda&period=0\|7\|30\|all&device=<id>` |
| `GET /api/monitor/status` | logado | Situação do monitor (última e próxima rodada) |
| `GET /api/users` | superadmin | Lista os usuários (`id`, `name`, `email`, `role`, `isRoot`, `createdAt`; nunca a senha), com a raiz primeiro |
| `POST /api/users` | superadmin | Cria uma conta: `{ name, email, password, role? }` (`role`: `superadmin`, `admin` ou `viewer`, padrão `viewer`; mesmas regras do cadastro) → `201 { user }`. `409` se o e-mail já existir |
| `PATCH /api/users/:id` | superadmin | Altera `{ name?, email?, role?, password? }` (pelo menos um, tudo numa transação). Na raiz, só a senha, e só pela própria raiz (`409`/`403`). `409` se o e-mail for de outra conta ou se rebaixar a própria conta |
| `DELETE /api/users/:id` | superadmin | Exclui a conta → `204`. `409` se for a raiz ou a própria conta |

O corpo de `POST` e `PUT /api/devices` tem os campos `name`, `model`, `host`, `checkType` (`ping`,
`tcp` ou `http`), `port`, `latencyThresholdMs`, `lossThresholdPct`, `categoryId`, `isGateway`, `icon`
e `monitoringEnabled`. O status, a latência e a perda não são aceitos no corpo: quem os define é o
monitor.

### Formato dos erros

Todo erro tem o mesmo formato:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Dados inválidos. Verifique os campos destacados.",
             "details": [ { "field": "host", "message": "Informe o host (IP ou nome)." } ] } }
```

O campo `details` só aparece nos erros de validação e em alguns conflitos.

| Status | Códigos |
|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_JSON`, `BAD_REQUEST` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `INVALID_TOKEN` |
| 403 | `FORBIDDEN` (o perfil não permite a ação, ex.: Usuário cadastrando dispositivo ou Admin gerenciando usuários) |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` (e-mail ou nome repetido, alerta já reconhecido, alteração da conta raiz...) |
| 413 | `PAYLOAD_TOO_LARGE` (o corpo passou de 10 KB) |
| 429 | `TOO_MANY_REQUESTS` |
| 500 | `INTERNAL_ERROR` |
| 503 | `DATABASE_UNAVAILABLE` |

Detalhes internos, como o stack trace ou as mensagens do SQLite, nunca vão na resposta. Eles ficam só
no log do servidor.

### Exemplos de resposta

Respostas reais da API rodando com o banco de demonstração (`npm run db:reset:demo` e
`npm run demo:alvo`).

`POST /api/auth/login` com `{ "email": "admin@infraview.local", "password": "Admin@123" }` → `200`
(o token foi encurtado aqui):

```json
{
  "user": {
    "id": 1,
    "name": "Administrador",
    "email": "admin@infraview.local",
    "role": "superadmin",
    "isRoot": true,
    "createdAt": "2026-11-25T09:33:42.178Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

`GET /api/devices` → `200` (a lista tem os 6 dispositivos; aqui aparece só um):

```json
{
  "devices": [
    {
      "id": 3,
      "name": "CAM-DEMO",
      "model": "Alvo de demonstração (npm run demo:alvo)",
      "host": "127.0.0.1",
      "checkType": "tcp",
      "port": 7010,
      "status": "online",
      "statusNote": null,
      "latencyMs": 4,
      "latencyThresholdMs": 100,
      "lastLossPct": 0,
      "lossThresholdPct": 20,
      "isGateway": false,
      "icon": "bi-camera-video",
      "monitoringEnabled": true,
      "consecutiveFailures": 0,
      "upSince": "2026-11-25T09:33:44.533Z",
      "lastSeenAt": "2026-11-25T09:33:55.645Z",
      "lastCheckAt": "2026-11-25T09:33:55.645Z",
      "createdAt": "2026-11-25T09:33:42.178Z",
      "updatedAt": "2026-11-25T09:33:42.178Z",
      "category": { "id": 2, "name": "Segurança · CFTV / Alarme", "slug": "seguranca", "icon": "bi-camera-video" }
    }
  ]
}
```

`POST /api/devices` com `{ "name": "A", "host": "1.2.3.4 & del", "checkType": "tcp", "categoryId": 1 }` →
`400`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos. Verifique os campos destacados.",
    "details": [
      { "field": "name", "message": "O nome precisa ter pelo menos 2 caracteres." },
      { "field": "host", "message": "O host não pode ter espaços." }
    ]
  }
}
```

Qualquer rota protegida sem o cabeçalho `Authorization` → `401`:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "Faça login para continuar." } }
```

## Estrutura de pastas

```
src/
  server.js        sobe o servidor, abre o banco e liga o monitor
  app.js           monta o Express (helmet, cors, JSON, arquivos do front, rotas, erros)
  config/env.js    lê e valida o .env
  routes/          rotas da API
  controllers/     leem a requisição e montam a resposta
  services/        regras de negócio
  models/          SQL (better-sqlite3)
  validators/      schemas zod de cada rota
  middlewares/     autenticação, perfis, validação, limite de tentativas, 404 e erros
  monitor/         monitor, verificações (ping, tcp, http) e máquina de estados
  lib/ errors/     conexão com o banco, JWT, hash de senha e erros padronizados
db/                migrations (.sql), migrate, seed e reset
public/            front-end (HTML, CSS, JavaScript)
demo/alvo.js       alvo de demonstração (portas 7010, 7011 e 7012)
scripts/           npm run demo e npm run verificar
tests/             testes automatizados (node --test)
```
