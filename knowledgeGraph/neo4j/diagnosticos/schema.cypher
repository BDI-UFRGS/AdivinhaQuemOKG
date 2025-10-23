
CREATE CONSTRAINT diagnostico_id IF NOT EXISTS
FOR (d:Diagnostico)
REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT categoria_id IF NOT EXISTS
FOR (c:Categoria)
REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT valor_id IF NOT EXISTS
FOR (v:Valor)
REQUIRE v.id IS UNIQUE;

CREATE INDEX idx_diag_nome IF NOT EXISTS
FOR (d:Diagnostico)
ON (d.nome);

CREATE INDEX idx_cat_nome IF NOT EXISTS
FOR (c:Categoria)
ON (c.nome);

CREATE INDEX idx_val_nome IF NOT EXISTS
FOR (v:Valor)
ON (v.nome);

CREATE INDEX idx_val_id IF NOT EXISTS
FOR (v:Valor)
ON (v.id);
