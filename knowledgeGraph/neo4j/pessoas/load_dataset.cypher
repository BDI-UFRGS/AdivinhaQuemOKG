MATCH (p:Pessoa) DETACH DELETE p;
MATCH (c:Categoria) DETACH DELETE c;
MATCH (v:Valor) DETACH DELETE v;

CREATE CONSTRAINT pessoa_id    IF NOT EXISTS FOR (p:Pessoa)    REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT categoria_id IF NOT EXISTS FOR (c:Categoria) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT valor_id     IF NOT EXISTS FOR (v:Valor)     REQUIRE v.id IS UNIQUE;
CREATE CONSTRAINT pessoa_nome    IF NOT EXISTS FOR (p:Pessoa)    REQUIRE p.nome IS UNIQUE;
CREATE CONSTRAINT categoria_nome IF NOT EXISTS FOR (c:Categoria) REQUIRE c.nome IS UNIQUE;
CREATE CONSTRAINT valor_nome     IF NOT EXISTS FOR (v:Valor)     REQUIRE v.nome IS UNIQUE;

WITH $dataset AS data
UNWIND data.nodes AS n
CALL apoc.merge.node(n.labels, {id:n.id}, n.properties) YIELD node
RETURN count(*) AS nos_importados;

WITH $dataset AS data
UNWIND data.relationships AS r
MATCH (a {id:r.start}), (b {id:r.end})
CALL apoc.create.relationship(a, r.type, r.properties, b) YIELD rel
RETURN count(rel) AS rels_criados;
