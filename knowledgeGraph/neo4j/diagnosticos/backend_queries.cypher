@@name: groups
MATCH (entity)
WHERE $entityLabel IN labels(entity)
MATCH (entity)-[:POSSUI]->(grupo:Categoria)
WITH DISTINCT grupo,
     CASE
       WHEN grupo.id STARTS WITH 'cat|'
         THEN substring(grupo.id, 4)
       ELSE grupo.id
     END AS slug
RETURN slug,
       max(grupo.nome) AS nome,
       0 AS ordem,
       'POSSUI' AS relation
ORDER BY nome;

@@name: filters_feature_map
MATCH (entity)
WHERE $entityLabel IN labels(entity)
MATCH (entity)-[:POSSUI]->(grupo:Categoria)
WITH DISTINCT grupo
MATCH (grupo)-[relGF]->(feature:Categoria)
WHERE type(relGF) IN ['TEM', 'TEM_TIPO']
  AND (relGF.doenca IS NULL OR relGF.doenca = '')
WITH DISTINCT feature, grupo
OPTIONAL MATCH path = (feature)-[:TEM|TEM_TIPO*0..2]->(contextCat:Categoria)
WHERE ALL(rel IN relationships(path) WHERE rel.doenca IS NULL OR rel.doenca = '')
OPTIONAL MATCH (contextCat)-[atrib:TEM_TIPO]->(:Valor)
WHERE atrib.doenca IS NOT NULL
WITH feature,
     grupo,
     [ctx IN collect(DISTINCT atrib.contexto) WHERE ctx IS NOT NULL AND trim(ctx) <> ''] AS contextos
WITH feature,
     grupo,
     CASE
       WHEN size(contextos) > 0 THEN contextos[0]
       ELSE feature.nome
     END AS contexto,
     CASE
       WHEN feature.id STARTS WITH 'cat|'
         THEN substring(feature.id, 4)
       ELSE feature.id
     END AS slug,
     CASE
       WHEN grupo.id STARTS WITH 'cat|'
         THEN substring(grupo.id, 4)
       ELSE grupo.id
     END AS categoriaSlug
RETURN feature.id AS featureId,
       slug,
       max(feature.nome) AS nome,
       categoriaSlug,
       contexto,
       0 AS ordem
ORDER BY categoriaSlug, nome;

@@name: filters_aggregators
MATCH (entity)
WHERE $entityLabel IN labels(entity)
MATCH (entity)-[:POSSUI]->(grupo:Categoria)
WITH DISTINCT grupo
MATCH (grupo)-[relGF]->(feature:Categoria)
WHERE type(relGF) IN ['TEM', 'TEM_TIPO']
  AND (relGF.doenca IS NULL OR relGF.doenca = '')
WITH DISTINCT feature, grupo
OPTIONAL MATCH path = (feature)-[:TEM|TEM_TIPO*0..2]->(contextCat:Categoria)
WHERE ALL(rel IN relationships(path) WHERE rel.doenca IS NULL OR rel.doenca = '')
OPTIONAL MATCH (contextCat)-[atribContext:TEM_TIPO]->(:Valor)
WHERE atribContext.doenca IS NOT NULL
WITH DISTINCT feature,
       grupo,
       [ctx IN collect(DISTINCT atribContext.contexto) WHERE ctx IS NOT NULL AND trim(ctx) <> ''] AS contextos
WITH feature,
     grupo,
     CASE
       WHEN size(contextos) > 0 THEN contextos[0]
       ELSE feature.nome
     END AS contexto
MATCH (feature)-[relFA]->(agg:Categoria)
WHERE type(relFA) IN ['TEM', 'TEM_TIPO']
  AND (relFA.doenca IS NULL OR relFA.doenca = '')
  AND agg <> feature
OPTIONAL MATCH (agg)-[atrib:TEM_TIPO]->(:Valor)
WHERE atrib.doenca IS NOT NULL
  AND (
    contexto IS NULL OR contexto = '' OR atrib.contexto = contexto
  )
WITH feature,
     grupo,
     contexto,
     agg,
     collect(DISTINCT atrib.contexto) AS matchingContexts
WHERE size(matchingContexts) > 0
WITH feature,
     grupo,
     contexto,
     agg,
     CASE
       WHEN feature.id STARTS WITH 'cat|'
         THEN substring(feature.id, 4)
       ELSE feature.id
     END AS featureSlug,
     CASE
       WHEN grupo.id STARTS WITH 'cat|'
         THEN substring(grupo.id, 4)
       ELSE grupo.id
     END AS categoriaSlug,
     CASE
       WHEN agg.id STARTS WITH 'cat|'
         THEN substring(agg.id, 4)
       ELSE agg.id
     END AS aggregatorSlug
RETURN feature.id AS featureId,
       featureSlug,
       max(feature.nome) AS featureNome,
       categoriaSlug,
       contexto,
       agg.id AS aggregatorId,
       aggregatorSlug,
       max(agg.nome) AS aggregatorNome
ORDER BY featureSlug, aggregatorNome;

@@name: filters_direct
MATCH (entity)
WHERE $entityLabel IN labels(entity)
MATCH (entity)-[:POSSUI]->(grupo:Categoria)
WITH DISTINCT grupo
MATCH (grupo)-[relGF]->(feature:Categoria)
WHERE type(relGF) IN ['TEM', 'TEM_TIPO']
  AND (relGF.doenca IS NULL OR relGF.doenca = '')
WITH DISTINCT feature, grupo
OPTIONAL MATCH path = (feature)-[:TEM|TEM_TIPO*0..2]->(contextCat:Categoria)
WHERE ALL(rel IN relationships(path) WHERE rel.doenca IS NULL OR rel.doenca = '')
OPTIONAL MATCH (contextCat)-[atrib:TEM_TIPO]->(:Valor)
WHERE atrib.doenca IS NOT NULL
WITH feature,
     grupo,
     [ctx IN collect(DISTINCT atrib.contexto) WHERE ctx IS NOT NULL AND trim(ctx) <> ''] AS contextos
WITH feature,
     grupo,
     CASE
       WHEN size(contextos) > 0 THEN contextos[0]
       ELSE feature.nome
     END AS contexto,
     CASE
       WHEN feature.id STARTS WITH 'cat|'
         THEN substring(feature.id, 4)
       ELSE feature.id
     END AS featureSlug,
     CASE
       WHEN grupo.id STARTS WITH 'cat|'
         THEN substring(grupo.id, 4)
       ELSE grupo.id
     END AS categoriaSlug
WHERE NOT EXISTS {
  MATCH (feature)-[relChild]->(child:Categoria)
  WHERE type(relChild) IN ['TEM', 'TEM_TIPO']
    AND (relChild.doenca IS NULL OR relChild.doenca = '')
    AND child <> feature
}
RETURN feature.id AS featureId,
       featureSlug,
       max(feature.nome) AS featureNome,
       categoriaSlug,
       contexto,
       'valor' AS detailType,
       max(feature.nome) AS detailLabel
ORDER BY featureSlug;

@@name: filters_detail_options
MATCH (feature:Categoria {id: $featureId})
MATCH (parent:Categoria {id: $parentId})
MATCH (parent)-[rel:TEM_TIPO]->(valor:Valor)
WHERE rel.doenca IS NOT NULL
  AND ($contexto IS NULL OR $contexto = '' OR rel.contexto = $contexto)
RETURN DISTINCT valor.id AS id,
       coalesce(valor.nome, valor.id) AS nome
ORDER BY nome;

@@name: candidates
MATCH (entity)
WHERE $entityLabel IN labels(entity)
RETURN entity
ORDER BY coalesce(entity.ordem, entity.nome, entity.id);

@@name: graph_for_candidates
MATCH (entity)
WHERE $entityLabel IN labels(entity)
  AND entity.id IN $ids
WITH collect(entity) AS diagnosticos
CALL {
  WITH diagnosticos
  UNWIND diagnosticos AS entity
  MATCH (entity)-[rel:POSSUI]->(nivel1:Categoria)
  RETURN collect(DISTINCT nivel1) AS nivel1Nodes,
         collect(DISTINCT rel) AS possuiRels
}
CALL {
  WITH diagnosticos
  UNWIND diagnosticos AS entity
  MATCH (entity)-[:POSSUI]->(grupo:Categoria)
  MATCH path = (grupo)-[:TEM|TEM_TIPO*1..3]->(categoria:Categoria)
  WHERE ALL(rel IN relationships(path) WHERE rel.doenca IS NULL OR rel.doenca = '')
  WITH DISTINCT categoria, relationships(path) AS rels
  UNWIND rels AS rel
  RETURN collect(DISTINCT categoria) AS outrasCategorias,
         collect(DISTINCT rel) AS structRels
}
CALL {
  WITH diagnosticos
  UNWIND diagnosticos AS entity
  MATCH (categoria:Categoria)-[rel:TEM_TIPO]->(valor:Valor)
  WHERE rel.doenca = entity.id
  RETURN collect(DISTINCT valor) AS valorNodes,
         collect(DISTINCT rel) AS valorRels
}
WITH diagnosticos,
     nivel1Nodes,
     possuiRels,
     outrasCategorias,
     structRels,
     valorNodes,
     valorRels
WITH diagnosticos,
     coalesce(nivel1Nodes, []) + coalesce(outrasCategorias, []) AS categoriaList,
     coalesce(possuiRels, []) + coalesce(structRels, []) AS categoriaRelList,
     coalesce(valorNodes, []) AS valorList,
     coalesce(valorRels, []) AS valorRelList
UNWIND categoriaList AS categoria
WITH diagnosticos,
     collect(DISTINCT categoria) AS categorias,
     categoriaRelList,
     valorList,
     valorRelList
UNWIND categoriaRelList AS relCategoria
WITH diagnosticos,
     categorias,
     collect(DISTINCT relCategoria) AS categoriaRels,
     valorList,
     valorRelList
UNWIND valorList AS valor
WITH diagnosticos,
     categorias,
     categoriaRels,
     collect(DISTINCT valor) AS valores,
     valorRelList
UNWIND valorRelList AS relValor
RETURN diagnosticos,
       categorias,
       valores,
       categoriaRels,
       collect(DISTINCT relValor) AS valorRels;

@@name: availability_presence
MATCH (entity)
WHERE $entityLabel IN labels(entity)
  AND entity.id IN $ids
MATCH (group:Categoria)<-[:POSSUI]-(entity)
MATCH path = (group)-[:TEM|TEM_TIPO*1..3]->(categoria:Categoria)
WHERE ALL(rel IN relationships(path) WHERE rel.doenca IS NULL OR rel.doenca = '')
MATCH (categoria)-[rel:TEM_TIPO]->(:Valor)
WHERE rel.doenca = entity.id
WITH DISTINCT path
WITH DISTINCT nodes(path)[1] AS feature
WHERE feature IS NOT NULL
RETURN DISTINCT CASE
  WHEN feature.id STARTS WITH 'cat|'
    THEN substring(feature.id, 4)
  ELSE feature.id
END AS featureSlug;

@@name: availability_detail
MATCH (entity)
WHERE $entityLabel IN labels(entity)
  AND entity.id IN $ids
MATCH (group:Categoria)<-[:POSSUI]-(entity)
MATCH path = (group)-[:TEM|TEM_TIPO*1..3]->(categoria:Categoria)
WHERE ALL(rel IN relationships(path) WHERE rel.doenca IS NULL OR rel.doenca = '')
MATCH (categoria)-[rel:TEM_TIPO]->(valor:Valor)
WHERE rel.doenca = entity.id
WITH DISTINCT path, categoria, valor
WITH DISTINCT
  CASE
    WHEN nodes(path)[1].id STARTS WITH 'cat|'
      THEN substring(nodes(path)[1].id, 4)
    ELSE nodes(path)[1].id
  END AS featureSlug,
  CASE
    WHEN categoria = nodes(path)[1]
      THEN 'valor'
    WHEN categoria.id STARTS WITH 'cat|'
      THEN substring(categoria.id, 4)
    ELSE categoria.id
  END AS detailType,
  valor.id AS valueId
RETURN featureSlug,
       detailType,
       valueId;

@@name: question_detail
MATCH ()-[rel:TEM_TIPO]->(valor:Valor {id: $valorId})
WHERE rel.doenca = $alvoId
  AND ($contexto IS NULL OR $contexto = '' OR rel.contexto = $contexto)
RETURN valor.id AS valorSelecionado
ORDER BY valorSelecionado
LIMIT 1;

@@name: question_presence
MATCH (entity)
WHERE $entityLabel IN labels(entity)
  AND entity.id = $alvoId
OPTIONAL MATCH ()-[rel:TEM_TIPO]->(:Valor)
WHERE rel.doenca = entity.id
  AND ($contexto IS NULL OR $contexto = '' OR rel.contexto = $contexto)
RETURN CASE WHEN count(rel) > 0 THEN $presence ELSE NULL END AS resposta
LIMIT 1;

@@name: filters_apply
WITH coalesce($presenceConds, []) AS presencaFiltros,
     coalesce($detailConds, []) AS detalheFiltros
MATCH (entity)
WHERE $entityLabel IN labels(entity)
  AND ALL(cond IN presencaFiltros WHERE CASE coalesce(cond.condition, 'IGUAL')
    WHEN 'IGUAL' THEN EXISTS {
      MATCH ()-[rel:TEM_TIPO]->(:Valor)
      WHERE rel.doenca = entity.id
        AND (cond.contexto IS NULL OR cond.contexto = '' OR rel.contexto = cond.contexto)
    }
    ELSE NOT EXISTS {
      MATCH ()-[rel:TEM_TIPO]->(:Valor)
      WHERE rel.doenca = entity.id
        AND (cond.contexto IS NULL OR cond.contexto = '' OR rel.contexto = cond.contexto)
    }
  END)
  AND ALL(cond IN detalheFiltros WHERE CASE coalesce(cond.condition, 'IGUAL')
    WHEN 'IGUAL' THEN EXISTS {
      MATCH ()-[rel:TEM_TIPO]->(:Valor {id: cond.value})
      WHERE rel.doenca = entity.id
        AND (cond.contexto IS NULL OR cond.contexto = '' OR rel.contexto = cond.contexto)
    }
    ELSE NOT EXISTS {
      MATCH ()-[rel:TEM_TIPO]->(:Valor {id: cond.value})
      WHERE rel.doenca = entity.id
        AND (cond.contexto IS NULL OR cond.contexto = '' OR rel.contexto = cond.contexto)
    }
  END)
RETURN entity
ORDER BY coalesce(entity.ordem, entity.nome, entity.id);
