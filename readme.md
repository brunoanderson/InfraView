# 🌐 InfraView

## 📋 Descrição
O InfraView é um sistema web voltado para a área de Redes de Computadores, focado no monitoramento de infraestrutura e dispositivos IoT em uma rede local (LAN). O projeto centraliza, em um único painel estilo NOC (Centro de Operações de Rede), a visualização do status de conectividade, latência e disponibilidade de dispositivos como access points, câmeras de segurança, DVR, alarme e inversor solar, entre outros equipamentos conectados à rede.

Projeto acadêmico desenvolvido para a disciplina de Desenvolvimento Web. O escopo foi redefinido a partir de uma proposta inicial de monitoramento de túneis VPN Site-to-Site (inviável de testar em ambiente doméstico) para o monitoramento de uma LAN real, de forma que a aplicação possa futuramente ser conectada a um backend que colete dados reais dos dispositivos da rede.

## ✨ Funcionalidades
- Tela de login para acesso ao painel
- Dashboard com visão geral da rede: total de dispositivos, quantidade online/offline, alertas ativos, latência média e uptime do gateway
- Status por categoria de dispositivo (Rede Wi-Fi, Segurança, Energia, Outros), com barras de progresso animadas
- Latência por dispositivo, com barras codificadas por cor (normal / atenção / crítico)
- Menu lateral (offcanvas) com acesso rápido a todas as seções do sistema e contador de alertas ativos
- Tela de Rede com 26 dispositivos IoT detalhados (IP, latência, status e uptime), agrupados por categoria, com **filtro por status (Online/Offline/Atenção) e busca por nome/IP/modelo funcionando via JavaScript puro**
- Tela de Alertas com 12 eventos (ativos, resolvidos e informativos), **filtros por status e severidade funcionando via JavaScript puro**
- Tela de Relatórios e Logs, com histórico de 12 quedas (downtime) e 9 picos de latência, e **filtros por período, dispositivo e tipo de evento funcionando via JavaScript puro**; exportação (CSV/PDF) permanece simulada, reservada para a integração futura com backend
- Animações leves de entrada (cards, alertas e barras de progresso) respeitando `prefers-reduced-motion`

## 🛠️ Tecnologias Utilizadas
- Frontend: HTML5, CSS3, Bootstrap 5, Bootstrap Icons
- JavaScript puro (vanilla) para os filtros e busca — sem dependências externas, sem necessidade de backend

## 🚀 Como Executar

### Pré-requisitos
- Navegador web atualizado

### Instalação
1. Clone o repositório
   ```
   git clone https://github.com/usuario/infraview.git
   ```
2. Abra o arquivo `index.html` no navegador (ou use a extensão Live Server no VS Code)

## 📂 Estrutura do Projeto
```
infraview/
├── index.html          # Tela de login
├── dashboard.html       # Dashboard principal (visão geral da rede)
├── rede.html            # Listagem completa dos dispositivos por categoria
├── alertas.html         # Histórico de alertas (ativos e resolvidos)
├── relatorios.html      # Relatórios, logs de downtime/latência e exportação
└── style.css            # Estilos globais
```

> Nota: o projeto foi desenvolvido utilizando exclusivamente HTML, CSS e JavaScript puro, com dados fictícios estruturados estaticamente para validação de layout, navegação e experiência do usuário (UX). Os filtros e a busca já são totalmente funcionais no front-end (mostram/escondem os dados que já existem na página); a integração com um backend real (consumindo dados via API REST de dispositivos da rede local) está planejada para uma etapa futura do projeto, e é o que vai alimentar essas telas com dados de verdade em vez dos fictícios.

## 👥 Autores
- **Vinícius Ribeiro Maia**
- **Bruno Anderson**
- **Arthur Rodrigues**
