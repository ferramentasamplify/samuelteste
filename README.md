# Sniper — Dashboard e Comissões

Código React + Vite do dashboard de aquisição, comissões individuais, gestão e projeções.

## Online

- Dashboard: https://funil-dashboard.72.60.147.19.sslip.io/#dashboard
- Comissões: https://funil-dashboard.72.60.147.19.sslip.io/#comissoes

O GitHub armazena o código. A aplicação roda na VPS; este repositório não configura deploy automático.

## Executar

`npm ci`, `npm run dev`. Build: `npm run build`. Servidor: `npm run preview`.
O plugin server/commissions.mjs atende a API, inclusive no preview; hospedagem puramente estática não substitui o servidor.

## Dados e autenticação

Provisionar com segurança public/luiz-contatos.json e a configuração de autenticação/estado em .private/. Não são versionados, assim como arquivos .env. Sem esses arquivos, a aplicação completa não terá dados nem login configurados.

O atualizador aceita NOTION_TOKEN, OUTBOUND_NOTION_DATABASE_ID, OUTPUT_FILE e GOALS_CSV_URL. O script shell depende do n8n e caminhos da VPS atual. Relatórios aceitam SNIPER_CREATOR_MONTHLY_ROOT e SNIPER_CREATOR_DAILY_ROOT; seleções aceitam SNIPER_SELECTION_FILE.
