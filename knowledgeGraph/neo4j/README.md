# Grafo de Conhecimento do "Adivinha Quem"

Este diretório contém artefatos para materializar os diferentes datasets do jogo como grafos de conhecimento no estilo Neo4j. A modelagem preserva 100% das informações originais e mantém os mesmos IDs das entidades, características e valores usados pelo frontend.

Cada tema disponível no aplicativo possui uma subpasta própria (`./<nome_do_grafo>/`) com os scripts, consultas e metadados necessários para materializar e consultar aquele grafo. O arquivo `config.json` dentro de cada pasta descreve o grafo (nome, rótulo principal, dataset materializado correspondente etc.) e é usado automaticamente pelo back-end para descobrir os recursos disponíveis.

## Estrutura conceitual

- **(:Pessoa {id})**: nó principal de cada candidato, com propriedades textuais originais e `slug` normalizado.
- **(:Caracteristica {id, slug, tipo})**: representa todos os nós que não são pessoas — inclui nós de nível 1 (Acessorio/Aparência/Identidade), características específicas (ex.: `cabelo`, `barba`), atributos intermediários (ex.: `cor`, `tamanho`) e valores finais (ex.: `cor|verde`). O campo `tipo` indica a natureza do nó (`nivel1`, `feature`, `atributo`, `valor`).
- Ausências são representadas pela inexistência de relacionamentos. Se uma pessoa não possui determinada característica, nenhum nó ou aresta adicional é criado.
- Relacionamentos canônicos:
  - `(:Pessoa)-[:POSSUI]->(:Caracteristica {tipo: 'nivel1'})` — liga o candidato aos nós de primeiro nível específicos daquele alvo.
  - `(:Caracteristica {tipo: 'nivel1'})-[:TEM_TIPO]->(:Caracteristica {tipo: 'feature'})` — conecta cada nó de nível 1 às características que podem descrevê-lo (ex.: Aparência → Cabelo).
  - `(:Caracteristica {tipo: 'feature'})-[:TEM]->(:Caracteristica {tipo: 'atributo'})` — relaciona características a atributos genéricos, como Cor ou Tamanho.
  - `(:Caracteristica)-[:TEM_TIPO]->(:Caracteristica {tipo: 'valor'})` — aponta para os valores concretos (ex.: Cor → Verde) e também registra a escolha do alvo (`feature` → `valor`).

## Arquivos (exemplo: `pessoas/`)

| Arquivo | Descrição |
| --- | --- |
| [`config.json`](./pessoas/config.json) | Metadados do grafo (nome interno, título, rótulo principal no Neo4j, dataset materializado padrão e se é o grafo padrão). |
| [`schema.cypher`](./pessoas/schema.cypher) | Constraints de unicidade e índices para Neo4j. |
| [`load_dataset.cypher`](./pessoas/load_dataset.cypher) | Script idempotente (via `MERGE`) que transforma a saída atual do dataset no modelo alvo. Requer o parâmetro `$pessoas` com a lista de registros materializados. |
| [`queries_filtros.cypher`](./pessoas/queries_filtros.cypher) | Consultas equivalentes às operações de filtragem do jogo (verificar características e retornar candidatos). |
| [`queries_visualizacao.cypher`](./pessoas/queries_visualizacao.cypher) | Consultas para recuperar o subgrafo dos candidatos selecionados e suas características para visualização. |
| [`backend_queries.cypher`](./pessoas/backend_queries.cypher) | Conjunto de consultas nomeadas utilizadas pelo back-end. Cada bloco começa com `// name: <identificador>` e pode referenciar parâmetros (`$entityLabel`, `$ids`, etc.). |

### Consultas obrigatórias no `backend_queries.cypher`

Cada grafo deve disponibilizar, no mínimo, as seguintes consultas nomeadas (todas retornam dados no formato esperado pelo serviço de dataset do back-end):

- `groups` — lista os grupos de filtros (nós de nível 1) associados ao rótulo `$entityLabel`.
- `filters_feature_map` — retorna o mapeamento base das características (slug, nome, categoria e relação textual padrão).
- `filters_aggregators` — descreve filtros categóricos derivados de atributos agregadores (ex.: cor, tamanho).
- `filters_direct` — descreve filtros categóricos ligados diretamente aos valores da característica.
- `filters_detail_options` — lista os valores possíveis (`id`, `nome`) para uma combinação (`featureSlug`, `parentSlug`).
- `candidates` — devolve os nós candidatos (o registro deve incluir a coluna `p` ou `entity`).
- `graph_for_candidates` — retorna coleções de nós e relacionamentos necessários para montar o subgrafo visualizado.
- `availability_presence` e `availability_detail` — calculam a disponibilidade atual de filtros booleanos e categóricos para um conjunto de candidatos (`$ids`).
- `question_detail` e `question_presence` — verificam o valor da característica perguntada para o alvo atual.
- `filters_apply` — reaplica todos os filtros (booleanos e categóricos) e retorna os candidatos compatíveis.

## Uso típico

1. **Criar o schema**
   ```cypher
   :use neo4j
   :source "schema.cypher"
   ```
2. **Carregar o dataset** (exemplo usando Neo4j Browser, assumindo `pessoas` como parâmetro JSON)
   ```cypher
   :param pessoas => $JSON_DAS_PESSOAS
   :source "pessoas/load_dataset.cypher"
   ```
3. **Filtrar candidatos**
   ```cypher
   :param entityLabel => "Pessoa"
   :param presenceFilters => [{slug:"cabelo", condicao:"IGUAL"}]
   :param detailFilters => [{featureSlug:"cabelo", valor:"cor|castanho", condicao:"IGUAL"}]
   :source "pessoas/queries_filtros.cypher"
   ```
4. **Visualizar o subgrafo**
   ```cypher
   :param entityLabel => "Pessoa"
   :param pessoaIds => ["P001", "P010"]
   :source "pessoas/queries_visualizacao.cypher"
   ```

Todas as consultas usam `MERGE` e filtros idempotentes, garantindo que execuções repetidas mantenham o grafo consistente com o dataset original.
