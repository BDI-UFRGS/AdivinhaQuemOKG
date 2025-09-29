MATCH (p)
WHERE $entityLabel IN labels(p) AND p.id = $pessoaId
OPTIONAL MATCH ()-[rel:TEM_TIPO]->(valor:Valor)
WHERE rel.pessoa = p.id
  AND ($contexto IS NULL OR $contexto = '' OR rel.contexto = $contexto)
  AND ($valorId IS NULL OR valor.id = $valorId)
WITH p, collect(DISTINCT valor.id) AS valores
RETURN size(valores) > 0 AS possuiCaracteristica,
       CASE WHEN size(valores) > 0 THEN valores[0] ELSE NULL END AS valorSelecionado;

WITH coalesce($presenceFilters, []) AS presencaFiltros,
     coalesce($detailFilters, []) AS detalheFiltros
MATCH (p)
WHERE $entityLabel IN labels(p)
  AND ALL(cond IN presencaFiltros WHERE CASE coalesce(cond.condicao, 'IGUAL')
    WHEN 'IGUAL' THEN EXISTS {
      MATCH ()-[rel:TEM_TIPO]->(:Valor)
      WHERE rel.pessoa = p.id
        AND (cond.contexto IS NULL OR cond.contexto = '' OR rel.contexto = cond.contexto)
    }
    ELSE NOT EXISTS {
      MATCH ()-[rel:TEM_TIPO]->(:Valor)
      WHERE rel.pessoa = p.id
        AND (cond.contexto IS NULL OR cond.contexto = '' OR rel.contexto = cond.contexto)
    }
  END)
  AND ALL(cond IN detalheFiltros WHERE CASE coalesce(cond.condicao, 'IGUAL')
    WHEN 'IGUAL' THEN EXISTS {
      MATCH ()-[rel:TEM_TIPO]->(:Valor {id: cond.valor})
      WHERE rel.pessoa = p.id
        AND (cond.contexto IS NULL OR cond.contexto = '' OR rel.contexto = cond.contexto)
    }
    ELSE NOT EXISTS {
      MATCH ()-[rel:TEM_TIPO]->(:Valor {id: cond.valor})
      WHERE rel.pessoa = p.id
        AND (cond.contexto IS NULL OR cond.contexto = '' OR rel.contexto = cond.contexto)
    }
  END)
RETURN p
ORDER BY p.id;
