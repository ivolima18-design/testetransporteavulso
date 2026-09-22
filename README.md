# WFS - Sistema de Solicitação de Transporte Avulso

Sistema para solicitação e gestão de transporte avulso (Uber) para
colaboradores da WFS em horários sem transporte público, integrado ao
Google Sheets. Frontend em React + Vite, backend em Cloudflare Pages
Functions, com Cloudflare KV para persistência e um Google Apps Script
como ponte de sincronização com a planilha oficial.

## Estrutura

- `src/` — frontend React (Vite).
- `functions/` — API do backend, executada como Cloudflare Pages Functions
  (cada arquivo em `functions/api/**` vira uma rota `/api/**`).
- `public/` — arquivos estáticos, headers de segurança (`_headers`) e
  regras de SPA (`_redirects`).
- `google-apps-script.js` — código a ser colado no editor de Apps Script
  da planilha oficial (Extensões > Apps Script), para receber os dados
  enviados pelo backend.

## Rodando localmente

```bash
npm install
npm run dev
```

Isso sobe o frontend via Vite. Para testar as rotas de `functions/`
localmente com o mesmo ambiente do Cloudflare, use o Wrangler:

```bash
npx wrangler pages dev -- npm run dev
```

## Deploy (Cloudflare Pages)

1. Vincule o namespace KV `WFS_KV` ao projeto (Settings > Functions > KV
   namespace bindings) — necessário para persistir usuários e solicitações.
2. Configure as variáveis/segredos descritos em `.env.example` no painel
   do Cloudflare (Settings > Variables and Secrets). **`AUTH_SECRET` é
   obrigatório** — sem ele o sistema assina os tokens de login com uma
   chave padrão fixa no código-fonte.
3. Publique o Web App do `google-apps-script.js` na planilha oficial e
   cole a URL gerada em `GOOGLE_SHEETS_WEBHOOK_URL`.
4. `npm run build` gera o `dist/` usado pelo Cloudflare Pages
   (`pages_build_output_dir` já configurado no `wrangler.toml`).
