# Dashboard GMV · Squads Pro

Dashboard V0 para visualização do GMV por squad de criadores de conteúdo.
Construído em React + Vite.

## O que este projeto é

Este é o **layout funcional** do dashboard — a parte visual. Os dados
exibidos são de exemplo. A integração com o banco de dados / API da
empresa ainda precisa ser feita.

## Estrutura de arquivos

```
dashboard-gmv/
├── index.html              → ponto de entrada HTML
├── package.json            → dependências do projeto
├── vite.config.js          → configuração do Vite
└── src/
    ├── main.jsx             → inicializa o React
    ├── App.jsx               → componente raiz
    ├── DashboardGMV.jsx      → o dashboard em si (toda a lógica está aqui)
    └── index.css            → estilos base
```

## Como rodar localmente

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`

## Integração com dados reais

O dashboard consome `GET /api/gmv-historico`.

Esse endpoint lê a Data Table `gmv_relatorios` do n8n, que é alimentada
pelos arquivos Excel da pasta Dashboard GMV no Google Drive.

Variáveis necessárias no Vercel:

```bash
N8N_API_KEY=<api-key do n8n>
N8N_BASE_URL=https://n8n.amplifyugc.co
N8N_GMV_TABLE_ID=PUk4cvXS0H2TSsrZ
```

Se a API não responder, o dashboard mantém dados de exemplo como fallback.

## Contato

Construído por [área de Analytics] como base para o V0.
Qualquer dúvida sobre a lógica de cálculo (taxas, totais), checar
as funções `calcTaxa` e `totalGMV` no topo do componente.
