MATCH (p)
WHERE $entityLabel IN labels(p)
  AND p.id IN $pessoaIds
OPTIONAL MATCH (p)-[relGrupo:POSSUI]->(grupo:Categoria)
OPTIONAL MATCH (grupo)-[relFeature]->(feature:Categoria)
WHERE type(relFeature) IN ['TEM', 'TEM_TIPO']
  AND (relFeature.pessoa IS NULL OR relFeature.pessoa = '')
OPTIONAL MATCH (feature)-[relSub]->(subCategoria:Categoria)
WHERE type(relSub) IN ['TEM', 'TEM_TIPO']
  AND (relSub.pessoa IS NULL OR relSub.pessoa = '')
OPTIONAL MATCH (feature)-[relFeatureValor:TEM_TIPO]->(valor:Valor)
WHERE relFeatureValor.pessoa = p.id
OPTIONAL MATCH (subCategoria)-[relSubValor:TEM_TIPO]->(valorSub:Valor)
WHERE relSubValor.pessoa = p.id
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
  AND (relFeature.pessoa IS NULL OR relFeature.pessoa = '')
OPTIONAL MATCH (feature)-[relSub]->(subCategoria:Categoria)
WHERE type(relSub) IN ['TEM', 'TEM_TIPO']
  AND (relSub.pessoa IS NULL OR relSub.pessoa = '')
OPTIONAL MATCH (feature)-[relFeatureValor:TEM_TIPO]->(valor:Valor)
WHERE relFeatureValor.pessoa = p.id
OPTIONAL MATCH (subCategoria)-[relSubValor:TEM_TIPO]->(valorSub:Valor)
WHERE relSubValor.pessoa = p.id
RETURN p,
       relGrupo, grupo,
       relFeature, feature,
       relSub, subCategoria,
       relFeatureValor, valor,
       relSubValor, valorSub;
