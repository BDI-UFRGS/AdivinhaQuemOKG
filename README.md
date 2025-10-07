# Projeto Extensão

Esta versão organiza o MVP em uma arquitetura mínima com front-end, back-end e módulo de grafos de conhecimento independentes.

## Pré-requisitos

- Node.js 20+
- npm 10+
- Docker e Docker Compose (para execução via containers)

## Rodar

```bash
make run
```

## Scripts principais

- `make build` – compila os grafos, o back-end e o front-end.
- `make lint` – roda `tsc --noEmit` em todos os pacotes.
- `make test` – executa os checadores de cada pacote (mesmo fluxo do `lint`).
- `make run` – sobe toda a stack com Docker Compose (`docker compose up --build`).
- `make down` – derruba os containers.

Também é possível executar comandos diretamente em cada workspace, por exemplo:

```bash
npm run dev --prefix backend    # back-end em modo watch (porta 3000)
npm run dev --prefix frontend   # front-end Vite (porta 5173)
```

## Variáveis de ambiente

O front-end utiliza `VITE_API_URL` para localizar a API. Durante o desenvolvimento local, o valor padrão é `http://localhost:3000` (ver `frontend/.env`). No build em container o valor é definido como `http://backend:3000` via argumento de build.

## Containerização

Os serviços possuem `Dockerfile` dedicados em `backend/` e `frontend/`. O `docker-compose.yml` expõe:

- `frontend`: porta 4173 (aplicação estática servida via `serve`).
- `backend`: porta 3000 (API HTTP).

Executando `make run` ou `docker compose up --build` todas as dependências são resolvidas automaticamente.

## Grafos de conhecimento

Os grafos disponíveis ficam em [`knowledgeGraph/neo4j/`](knowledgeGraph/neo4j/). Cada pasta possui arquivos de schema, carga e consultas consumidas pelo back-end. No boot a API lista automaticamente os grafos configurados e o front-end permite escolher qual deles utilizar.

- `pessoas/` — grafo de características pessoais, carregado diretamente a partir de `knowledgeGraph/materialized/pessoas.json`.
- `diagnosticos/` — grafo clínico carregado diretamente a partir de `knowledgeGraph/materialized/diagnosticos.json`.

As consultas e filtros expostos pelo back-end mantêm o mesmo padrão entre os grafos, garantindo que a UX permaneça inalterada ao alternar entre eles.
