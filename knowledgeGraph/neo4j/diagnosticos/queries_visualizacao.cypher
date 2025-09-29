MATCH (p)
WHERE $entityLabel IN labels(p)
  AND p.id IN $diagnosticoIds
OPTIONAL MATCH (p)-[relGrupo:POSSUI]->(grupo:Categoria)
OPTIONAL MATCH (grupo)-[relFeature]->(feature:Categoria)
WHERE type(relFeature) IN ['TEM', 'TEM_TIPO']
  AND (relFeature.doenca IS NULL OR relFeature.doenca = '')
OPTIONAL MATCH (feature)-[relSub]->(subCategoria:Categoria)
WHERE type(relSub) IN ['TEM', 'TEM_TIPO']
  AND (relSub.doenca IS NULL OR relSub.doenca = '')
OPTIONAL MATCH (feature)-[relFeatureValor:TEM_TIPO]->(valor:Valor)
WHERE relFeatureValor.doenca = p.id
OPTIONAL MATCH (subCategoria)-[relSubValor:TEM_TIPO]->(valorSub:Valor)
WHERE relSubValor.doenca = p.id
RETURN p,
       relGrupo, grupo,
       relFeature, feature,
       relSub, subCategoria,
       relFeatureValor, valor,
       relSubValor, valorSub;

MATCH (p)
WHERE $entityLabel IN labels(p)
WITH p
ORDER BY p.id
SKIP coalesce($offset, 0)
LIMIT coalesce($limite, 50)
OPTIONAL MATCH (p)-[relGrupo:POSSUI]->(grupo:Categoria)
OPTIONAL MATCH (grupo)-[relFeature]->(feature:Categoria)
WHERE type(relFeature) IN ['TEM', 'TEM_TIPO']
  AND (relFeature.doenca IS NULL OR relFeature.doenca = '')
OPTIONAL MATCH (feature)-[relSub]->(subCategoria:Categoria)
WHERE type(relSub) IN ['TEM', 'TEM_TIPO']
  AND (relSub.doenca IS NULL OR relSub.doenca = '')
OPTIONAL MATCH (feature)-[relFeatureValor:TEM_TIPO]->(valor:Valor)
WHERE relFeatureValor.doenca = p.id
OPTIONAL MATCH (subCategoria)-[relSubValor:TEM_TIPO]->(valorSub:Valor)
WHERE relSubValor.doenca = p.id
RETURN p,
       relGrupo, grupo,
       relFeature, feature,
       relSub, subCategoria,
       relFeatureValor, valor,
       relSubValor, valorSub;
