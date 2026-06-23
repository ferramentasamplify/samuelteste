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

## Para conectar aos dados reais

Tudo que precisa ser alterado está no topo do arquivo
`src/DashboardGMV.jsx`:

### 1. Lista de squads (`SQUADS_CONFIG`)

```js
const SQUADS_CONFIG = [
  { nome: "Squad Pro Flora Be", cor: "#6366f1" },
  { nome: "Squad Pro Konjac",   cor: "#06b6d4" },
  // adicionar/remover squads aqui
];
```

Como o número de squads varia mês a mês, esta lista pode ser
substituída por uma chamada à API que retorne os squads ativos.

### 2. Dados históricos (`GMV_HISTORICO`)

```js
const GMV_HISTORICO = [
  {
    mes: "Jan",
    "Squad Pro Flora Be": 142000,
    "Squad Pro Konjac": 98000,
    // ...
  },
  // um objeto por mês
];
```

Formato esperado de cada item: `{ mes: string, [nomeDoSquad]: number }`.
Squads sem dado em um determinado mês podem ser omitidos — o
dashboard trata isso como zero automaticamente.

### 3. Sugestão de integração

Substituir o array fixo por uma chamada de API, por exemplo:

```js
const [gmvHistorico, setGmvHistorico] = useState([]);

useEffect(() => {
  fetch("/api/gmv-historico")
    .then((res) => res.json())
    .then(setGmvHistorico);
}, []);
```

## Contato

Construído por [área de Analytics] como base para o V0.
Qualquer dúvida sobre a lógica de cálculo (taxas, totais), checar
as funções `calcTaxa` e `totalGMV` no topo do componente.
