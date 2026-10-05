# 🌐 InfraView

![InfraView](InfraView.png)

Dashboard estilo NOC para monitorar a **disponibilidade (UP / DOWN)** de dispositivos de uma rede local.
Projeto acadêmico de Desenvolvimento Web Front-End — **Vinícius Ribeiro Maia, Bruno Anderson, Arthur Rodrigues**.

## 1. Ideia, objetivo e público-alvo

Centralizar em um painel único o estado (online/offline) de equipamentos de rede, segurança, energia e IoT de uma LAN, com cadastro, remoção, simulação de queda/retorno, histórico de alertas e registro de eventos.
**Público-alvo:** técnicos de NOC e entusiastas de redes/automação residencial (TP-Link Deco, DVR/câmeras e alarmes Intelbras, inversor solar etc.).

## 2. Benchmarking

| Ferramenta | O que faz bem (e inspirou o InfraView) | Limitação para nosso público | Nosso diferencial |
|---|---|---|---|
| **Grafana** | Cartões de indicadores, painéis de status, histórico de eventos | Precisa de fonte de dados (Prometheus etc.) e configuração pesada | Painel pronto, focado só em UP/DOWN |
| **Zabbix** | Alerta nasce de mudança de estado monitorada (triggers); API completa | Instalação e curva de aprendizado altas para uma rede residencial | Regra única e simples: DOWN abre alerta, UP resolve |
| **Webmin** | Administração web de um servidor/host | Foca em administrar *um* servidor, não em visão geral de vários dispositivos | Visão unificada de rede, segurança, energia e IoT |
| **Uptime Kuma** | Monitor UP/DOWN self-hosted, simples (o mais próximo do nosso escopo) | Voltado a serviços/URLs, não a categorias de dispositivos de LAN | Agrupamento por categoria e modelos reais de equipamento |
| **App TP-Link Deco** | Lista de dispositivos por categoria com status online/offline | Só enxerga equipamentos TP-Link | Independente de fabricante (Intelbras, Growatt, Synology...) |

**Em uma frase:** o InfraView é um "Zabbix simplificado para casa": a clareza do app do Deco com a lógica de alertas de um NOC.

## 3. Estratégia para obtenção de dados reais

**Hoje (mock):** o `db.json` é servido pelo **JSON Server** como API REST (`/dispositivos`, `/alertas`, `/logs`).

**Por que é preciso um backend:** o navegador não consegue executar ping/SNMP. Um **coletor** (worker Node ou Python) roda na mesma LAN, mede os dispositivos e grava o resultado no banco; o front só consome a API.

```
[Coletor agendado] --ping/SNMP--> dispositivos da LAN
        |  grava status, latencia_ms, ultima_checagem
        v
[API REST / Banco] <--fetch-- [Front-end InfraView]  (nada muda aqui, só API_BASE_URL)
```

**Hipóteses técnicas (da mais simples à mais completa):**

1. **Ping/ICMP agendado** (a 1ª a implementar). A cada 30-60 s o worker executa, para cada IP:
   ```bash
   ping -c 1 -W 1 192.168.1.1        # Linux/macOS (exit code 0 = UP; tempo no stdout = latencia_ms)
   ping -n 1 -w 1000 192.168.1.1     # Windows
   nmap -sn 192.168.1.0/24           # descobre hosts ativos na sub-rede inteira
   ```
2. **SNMP** em equipamentos compatíveis (NAS Synology, roteadores gerenciáveis):
   ```bash
   snmpget -v2c -c public 192.168.1.40 1.3.6.1.2.1.1.3.0   # sysUpTime (se responde, está UP)
   snmpwalk -v2c -c public 192.168.1.40 1.3.6.1.2.1.2.2     # tabela de interfaces
   ```
3. **API do Zabbix** (JSON-RPC `host.get` / `trigger.get`) sincronizando hosts e triggers para dentro do nosso banco.
4. **Logs do roteador/DHCP** (syslog ou lista de concessões DHCP) para descobrir dispositivos novos.
5. **Nós TP-Link Deco:** não existe API oficial pública; bibliotecas da comunidade usam a API local não documentada. Tratamos como hipótese frágil, com o ping como alternativa segura.
6. **Banco de dados real** (SQLite/PostgreSQL) no lugar do `db.json`, mantendo as mesmas rotas.

**Transição sem mexer no front:** o coletor passa a preencher `status` e `latencia_ms` (e, futuramente, `ultima_checagem`) em `/dispositivos`. Ao detectar mudança UP↔DOWN, ele aplica a mesma regra de negócio abaixo (abrir/resolver alerta e gravar log em `/logs`).

## 🚨 Regra de negócio

Alertas e cores de status são gerados **exclusivamente** por mudança de estado **UP ↔ DOWN**:
- dispositivo vai para **DOWN** → abre alerta `ativo`;
- volta para **UP** → alertas ativos dele viram `resolvido`;
- excluir um dispositivo também resolve seus alertas ativos.

Latência é **somente informativa** (nunca gera alerta nem cor de aviso).
O botão **Resolver** (tela Alertas) marca o alerta como tratado, mas **não altera o status do dispositivo**.
Toda ação (cadastrar, derrubar/ligar, excluir, resolver) grava um registro em `/logs`, exibido em Relatórios.

## 🚀 Como executar

**Pré-requisito:** Node.js **22.12 ou superior** (exigência do JSON Server 1.x). Verifique com `node -v`.

```bash
npm install     # instala json-server e http-server
npm start       # sobe API (porta 3000) + site (porta 8080)
```

Abra **http://localhost:8080** (login simulado: já vem preenchido, é só clicar em *Entrar no Painel*).
`Ctrl+C` encerra os dois servidores.

### Alternativa: dois terminais / Live Server
```bash
npm run api     # JSON Server em http://localhost:3000
npm run web     # site em http://localhost:8080
```
Ou sirva a pasta com a extensão **Live Server** do VS Code (porta 5500) mantendo `npm run api` ligado.
> Abrir os `.html` direto (`file://`) **não funciona**: módulos ES exigem HTTP.

### Restaurar os dados de exemplo
As ações da interface alteram o `db.json`. Para voltar ao estado inicial: `npm run reset`. O script copia o `db.seed.json` para o `db.json` e **desloca as datas** para que o evento mais recente seja "agora", assim os filtros de 24 h e 7 dias de Relatórios sempre têm dados na demonstração. Rode o reset antes de apresentar (e antes de commitar o `db.json`).

### Problemas comuns
| Sintoma | Causa / solução |
|---|---|
| Banner vermelho "Não foi possível conectar ao servidor" | API desligada. Rode `npm start` ou `npm run api`. |
| `EADDRINUSE` | Porta 3000/8080 ocupada. Feche o outro processo. |
| Erro de engine / `json-server` não inicia | Node antigo. Atualize para 22.12+. |
| Página em branco / erro de módulo | Aberta via `file://`. Use `http://localhost:8080`. |
| Ícones/estilo sem carregar | Precisa de internet (Bootstrap via CDN). |

## 🏗️ Arquitetura (ES Modules, zero JS inline)

```
index.html        -> js/main-index.js      login simulado (submit + preventDefault)
dashboard.html    -> js/main-dashboard.js  GET /dispositivos + /alertas, widgets via DOM
alertas.html      -> js/main-alertas.js    GET /alertas, tabela via DOM, PATCH "Resolver"
rede.html         -> js/main-rede.js       CRUD de dispositivos (GET/POST/PATCH/DELETE) + busca em tempo real
relatorios.html   -> js/main-relatorios.js GET /logs, filtros em memória
                          │
                          ├── js/api.js   todos os fetch (try/catch, timeout de 8 s, erro HTTP e JSON inválido)
                          └── js/ui.js    barrel que reexporta js/ui/*.js (manipulação do DOM)
                                ├── ui/helpers.js · ui/feedback.js
                                └── ui/dispositivos.js · ui/alertas.js · ui/dashboard.js · ui/relatorios.js
```
- `api.js` não toca no DOM; os módulos de `ui/` não fazem fetch; os `main*.js` só orquestram.
- Escritas em cadeia (status → alerta → log) têm compensação: se o alerta ou o log falhar, o status do dispositivo é desfeito.
- Proibido `innerHTML`: tudo é montado com `createElement`, `textContent`, `classList`, `setAttribute`, `appendChild`.
- Tabelas e listas no HTML nascem **vazias**; falhas da API viram banner vermelho visível.

## 🗄️ Rotas da API (JSON Server)

| Coleção | Uso |
|---|---|
| `/dispositivos` | GET, POST, PATCH `/:id`, DELETE `/:id` |
| `/alertas` | GET, POST, PATCH `/:id`, filtro `?dispositivo_id=5&status=ativo` |
| `/logs` | GET, POST |

## 📂 Estrutura

```
infraview/
├── index.html · dashboard.html · rede.html · alertas.html · relatorios.html
├── style.css
├── db.json            # dados em uso (alterado pela interface)
├── db.seed.json       # seed original (nunca alterado) usado por "npm run reset"
├── package.json
├── scripts/dev.mjs    # npm start (API + site)
├── scripts/reset.mjs  # npm run reset (restaura o db.json e atualiza as datas)
└── js/ api.js · ui.js · ui/*.js · main-index.js · main-dashboard.js · main-rede.js · main-alertas.js · main-relatorios.js
```
