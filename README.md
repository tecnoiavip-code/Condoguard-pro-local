# 🏢 PortalGuard Local

Sistema Profissional de Controle de Acesso para Condomínios — **100% offline**.

Versão local do PortalGuard que substitui o backend cloud (Supabase) por um
backend próprio em **Node.js + Express + SQLite** (`node:sqlite`). O frontend é
idêntico ao original: apenas a camada de dados foi reimplementada por trás de
uma fachada de compatibilidade.

## ✨ Funcionalidades

- 👥 **Gestão de Moradores** — Cadastro completo com fotos e veículos
- 🚪 **Controle de Acesso** — Registro de entrada/saída de visitantes e prestadores
- 📦 **Gerenciamento de Correspondências** — Rastreamento de entregas
- 🖥️ **Gestão de Dispositivos** — Control ID e outros equipamentos
- 📊 **Logs e Relatórios** — Histórico completo de atividades
- 💾 **Backup/Restore** — Exportação e importação (CSV/JSON do banco)
- 🌓 **Dark Mode** — Tema claro/escuro
- 🔍 **Busca Avançada** — Filtros em todas as páginas
- 🎯 **QR Code** — Geração de QR Code para visitantes
- 🔐 **Autenticação Multi-usuário** — Login seguro para porteiros/administradores
- 📡 **Realtime** — Atualização instantânea via SSE (Server-Sent Events)

## 🛠️ Tecnologias

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Hook Form + Zod
- **Backend:** Node.js (≥ 22.5, requer `node:sqlite`), Express, SQLite
- **Testes:** Vitest

## ✅ Requisitos

- Node.js **v22.5 ou superior** (usa o módulo nativo `node:sqlite`). Testado com **v26.4.0**.
- Nenhum banco de dados externo. Nenhum serviço na nuvem.

## 🚀 Como Usar

```sh
# 1. Instale as dependências
npm install

# 2. Inicie em modo desenvolvimento (Vite :5173 + API :8080 com proxy)
npm run dev

# 3. Ou inicie apenas o servidor de produção (API + build servido em :8080)
npm run build
npm start
```

Acesse **http://localhost:5173** (dev) ou **http://localhost:8080** (produção).

### Credenciais padrão (admin)

| Campo  | Valor                     |
| ------ | ------------------------- |
| Email  | `admin@portalguard.local` |
| Senha  | `portaguard@2024`         |

Para personalizar, crie um arquivo `.env.local.seed` a partir do
`.env.local.seed.example` (a senha é armazenada com hash na primeira execução).

## 📂 Dados

- Banco SQLite: `data/portalguard.db`
- Fotos/arquivos: `data/photos/` (buckets `resident-photos`, `mail-photos`,
  `announcement-files`, `access-photos`)
- Para backup/restore, copie o diretório `data/` com o servidor parado, ou use
  a exportação do painel (relatórios).

## 🏗️ Arquitetura

```
React (páginas/hooks)  →  fachada src/integrations/supabase/client.ts
                                 │  (fetch/SSE, API semelhante ao Supabase)
                                 ▼
                         Express API  server/index.js
                                 │
                                 ▼
                     SQLite (node:sqlite)  server/db.js
```

- As páginas continuam importando de `@/integrations/supabase/client` — a fachada
  implementa `select/insert/update/upsert/delete`, filtros (`eq/neq/gt/gte/lt/lte/
  in/is/like/ilike`), `or()`, storage, auth e canal de realtime via SSE.
- Rota de registro do visitante externo (QR): `POST /api/external-visitor` (pública).

## 🧪 Testes

```sh
npm run typecheck   # TypeScript estrito (tsc --noEmit)
npm test            # Vitest (unidade da fachada + integração HTTP do backend)
npm run build       # Build de produção (TS + Vite)
```

## ⚙️ Scripts

| Script          | Descrição                                          |
| --------------- | -------------------------------------------------- |
| `npm run dev`   | Vite + API com proxy (`:5173` → `:8080`)           |
| `npm start`     | Sobe a API e serve o build em `:8080`              |
| `npm run build` | Build de produção do frontend (`vite build`)        |
| `npm run typecheck` | `tsc --noEmit` (strict)                      |
| `npm test`      | Vitest (unit + integração)                         |

## Dispositivos Control iD

O botão **Configurador Control iD** (página Dispositivos) baixa um HTML autônomo que
deve ser aberto no PC da portaria, na mesma rede dos equipamentos. Ele grava no flash
de cada dispositivo o Servidor Push apontando para este servidor local, habilitando o
envio de eventos de identificação (facial e TAG).

A liberação passa a ser decidida pelo banco — morador ativo, contrato em dia e lista
de bloqueados — com fallback para a decisão do próprio equipamento se o banco não
responder em até 2,5 s, para que o portão nunca fique travado.

### iDFace e prova de vida

O iDFace tem câmera RGB + IR e prova de vida própria. O configurador grava
`face_id.liveness_mode = "1"` (modo rigoroso) no equipamento. **Mantenha os
moradores sincronizados no iDFace**: a abertura automática do morador acontece
pela identificação local do equipamento, que tem prova de vida.

Quando o iDFace manda `event 3` (não identificou), o servidor **não** abre o
portão para morador a partir do frame RGB isolado — esse frame não tem prova de
vida e aceita foto. Visitantes reconhecidos nesse caminho continuam gerando
pedido de liberação para a portaria.

| Variável | Efeito |
| -------- | ------ |
| `VITE_CONTROLID_HOST` | `ip:porta` gravado no configurador. Padrão: o endereço usado no navegador, ou `127.0.0.1:8080`. |
| `CONTROLID_AUTO_REFRESH` | `1` reativa o reenvio periódico da configuração. Desativado por padrão, porque o configurador já grava no flash e o reenvio sobrescreve. |
| `CONTROLID_LIVENESS_MODE` | `1` (padrão) grava prova de vida rigorosa no iDFace; `0` usa o modo normal de fábrica. |
| `CONTROLID_FACE_SIMILARITY_THRESHOLD` | Opcional. Grava `bio_id.similarity_threshold_1ton` (padrão de fábrica `12300`). Teste `12800`–`13200` para reduzir falso aceite. |
| `PORTALGUARD_DEVICE_MIN_CONFIDENCE` | Opcional. Confiança mínima do `confidence` enviado pelo iDFace para liberar. `0` desliga. Calibre com leituras reais antes de ativar. |
| `PORTALGUARD_FACE_MATCH_MARGIN` | Margem mínima entre o melhor e o segundo candidato no motor central (padrão `0.05`). |
| `PORTALGUARD_FACE_CENTRAL_RESIDENT_AUTO_OPEN` | `1` volta a permitir que o motor central abra para morador usando apenas o frame RGB. **Não recomendado**: remove a prova de vida do caminho. |

# Condoguard-pro-local
