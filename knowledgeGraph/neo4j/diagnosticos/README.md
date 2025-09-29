# Grafo de Diagnósticos

Este diretório concentra os artefatos necessários para materializar o grafo de diagnósticos clínicos no Neo4j e expor as mesmas consultas utilizadas pelo jogo. O materializado original está em [`knowledgeGraph/materialized/diagnosticos.json`](../../materialized/diagnosticos.json) e é carregado diretamente pelo back-end durante a semeadura, sem necessidade de configuração do diretório de importação do Neo4j.

## Estrutura

- [`config.json`](./config.json) — metadados do grafo (nome, rótulo principal e arquivo materializado). Este grafo é o padrão exibido na aplicação.
- [`schema.cypher`](./schema.cypher) — constraints e índices idempotentes para `Diagnostico`, `Categoria` e `Valor`.
- [`load_dataset.cypher`](./load_dataset.cypher) — script de carga que aplica o schema e percorre o JSON materializado recebido pelo parâmetro `$dataset` para criar nós e relacionamentos.
- [`backend_queries.cypher`](./backend_queries.cypher) — consultas nomeadas utilizadas pelo back-end. O contrato é idêntico ao do grafo de pessoas (mesmos nomes de consultas e colunas retornadas).
- [`queries_filtros.cypher`](./queries_filtros.cypher) — auxiliares para filtrar diagnósticos manualmente.
- [`queries_visualizacao.cypher`](./queries_visualizacao.cypher) — consultas para reconstruir o subgrafo exibido na visualização.

## Exemplo de uso manual

```cypher
// Criar schema
:source "diagnosticos/schema.cypher"

// Carregar o materializado (assumindo arquivo disponível em knowledgeGraph/materialized/diagnosticos.json)
CALL apoc.load.json("file:///diagnosticos.json") YIELD value
WITH value AS dataset
CALL apoc.cypher.runFile("diagnosticos/load_dataset.cypher", { dataset })
YIELD value
RETURN value;

// Visualizar um diagnóstico e suas categorias de nível 1
MATCH (d:Diagnostico {id: 'doenca|apendicite_aguda'})-[:POSSUI]->(cat:Categoria)
RETURN d, cat;

// Investigar achados de ultrassom
MATCH (d:Diagnostico)-[:POSSUI]->(:Categoria {id:'cat|investigacao'})
MATCH (:Categoria {id:'cat|investigacao|ultrassom'})-[:TEM_TIPO]->(achado:Valor)
RETURN d, achado;
```

As mesmas categorias e hierarquias descritas no materializado são usadas para alimentar os filtros do jogo, preservando o comportamento existente.
