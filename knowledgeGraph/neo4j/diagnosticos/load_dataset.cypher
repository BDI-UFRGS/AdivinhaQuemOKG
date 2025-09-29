MATCH (d:Diagnostico) DETACH DELETE d;
MATCH (c:Categoria) DETACH DELETE c;
MATCH (v:Valor) DETACH DELETE v;

CREATE CONSTRAINT diagnostico_id IF NOT EXISTS FOR (d:Diagnostico) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT categoria_id   IF NOT EXISTS FOR (c:Categoria)   REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT valor_id       IF NOT EXISTS FOR (v:Valor)       REQUIRE v.id IS UNIQUE;
CREATE CONSTRAINT diagnostico_nome IF NOT EXISTS FOR (d:Diagnostico) REQUIRE d.nome IS UNIQUE;
CREATE CONSTRAINT categoria_nome    IF NOT EXISTS FOR (c:Categoria)   REQUIRE c.nome IS UNIQUE;
CREATE CONSTRAINT valor_nome        IF NOT EXISTS FOR (v:Valor)       REQUIRE v.nome IS UNIQUE;
CREATE INDEX idx_cat_nome IF NOT EXISTS FOR (c:Categoria) ON (c.nome);
CREATE INDEX idx_val_id   IF NOT EXISTS FOR (v:Valor)     ON (v.id);

WITH $dataset AS data
UNWIND data.nodes AS n
CALL apoc.merge.node(n.labels, {id: n.id}, n.properties) YIELD node
RETURN count(*) AS nos_importados;

WITH $dataset AS data
UNWIND data.relationships AS r
MATCH (inicio {id: r.start}), (fim {id: r.end})
CALL apoc.create.relationship(inicio, r.type, r.properties, fim) YIELD rel
RETURN count(rel) AS rels_criados;
