import { copyFile, mkdir, readFile } from "fs/promises";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { getNeo4jDriver, neo4jIntegerToNumber } from "./neo4jClient.js";

const seedingPromises = new Map();
const importCopyPromises = new Map();

const GRAPH_METADATA_LABEL = "GraphDatasetMetadata";
const GRAPH_METADATA_KEY = "activeGraph";

function parseStatements(script) {
  return script
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line.trim().startsWith("//") ? "" : line))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function toNumber(value) {
  if (typeof value === "number") {
    return value;
  }
  return neo4jIntegerToNumber(value);
}

async function runCountQuery(session, query, params = {}) {
  return session.executeRead(async (tx) => {
    const result = await tx.run(query, params);
    const record = result.records[0];
    if (!record) {
      return 0;
    }
    const total = record.get("total");
    return total === undefined || total === null ? 0 : toNumber(total);
  });
}

async function getActiveGraphName(session) {
  const result = await session.executeRead((tx) =>
    tx.run(
      `
        MATCH (meta:${GRAPH_METADATA_LABEL} { key: $key })
        RETURN meta.graphName AS graphName
        LIMIT 1
      `,
      { key: GRAPH_METADATA_KEY },
    ),
  );
  const record = result.records[0];
  if (!record) {
    return null;
  }
  const value = record.get("graphName");
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function setActiveGraphName(session, graphName) {
  const normalized = typeof graphName === "string" ? graphName.trim() : "";
  if (!normalized) {
    await session.executeWrite((tx) =>
      tx.run(
        `MATCH (meta:${GRAPH_METADATA_LABEL} { key: $key }) DETACH DELETE meta`,
        { key: GRAPH_METADATA_KEY },
      ),
    );
    return;
  }
  await session.executeWrite((tx) =>
    tx.run(
      `
        MERGE (meta:${GRAPH_METADATA_LABEL} { key: $key })
        SET meta.graphName = $graphName,
            meta.updatedAt = datetime()
      `,
      { key: GRAPH_METADATA_KEY, graphName: normalized },
    ),
  );
}

async function clearGraphMetadata(session) {
  await session.executeWrite((tx) =>
    tx.run(
      `MATCH (meta:${GRAPH_METADATA_LABEL} { key: $key }) DETACH DELETE meta`,
      { key: GRAPH_METADATA_KEY },
    ),
  );
}

async function hasEntities(session, entityLabel) {
  const total = await runCountQuery(
    session,
    "MATCH (p) WHERE $label IN labels(p) RETURN count(p) AS total",
    { label: entityLabel },
  );
  return total > 0;
}

async function needsReseeding(session, entityLabel) {
  const pessoas = await runCountQuery(
    session,
    "MATCH (p) WHERE $label IN labels(p) RETURN count(p) AS total",
    { label: entityLabel },
  );
  const categorias = await runCountQuery(
    session,
    "MATCH (c:Categoria) RETURN count(c) AS total",
  );
  const valores = await runCountQuery(
    session,
    "MATCH (v:Valor) RETURN count(v) AS total",
  );
  const legacyCaracteristicas = await runCountQuery(
    session,
    "MATCH (c:Caracteristica) RETURN count(c) AS total",
  );
  const legacyAceitaValor = await runCountQuery(
    session,
    "MATCH ()-[r:ACEITA_VALOR]->() RETURN count(r) AS total",
  );

  if (legacyCaracteristicas > 0 || legacyAceitaValor > 0) {
    return true;
  }

  if (pessoas === 0 && (categorias > 0 || valores > 0)) {
    return true;
  }

  if (pessoas > 0 && (categorias === 0 || valores === 0)) {
    return true;
  }

  return false;
}

async function clearExistingDataset(session, entityLabel, options = {}) {
  const { full = false } = options;
  if (full) {
    await session.executeWrite((tx) => tx.run("MATCH (n) DETACH DELETE n"));
  } else {
    await session.executeWrite((tx) =>
      tx.run(
        `
          MATCH (n)
          WHERE $label IN labels(n) OR n:Categoria OR n:Valor
          DETACH DELETE n
        `,
        { label: entityLabel },
      ),
    );
  }
  await clearGraphMetadata(session);
}

async function loadMaterializedDataset(definition) {
  try {
    const rawDataset = await readFile(definition.materializedDatasetUrl, "utf8");
    const dataset = JSON.parse(rawDataset);
    if (!dataset || typeof dataset !== "object") {
      throw new Error("Conteúdo do dataset materializado inválido");
    }
    return dataset;
  } catch (error) {
    throw new Error(
      `Falha ao carregar dataset materializado para grafo "${definition.name}": ${error.message}`,
    );
  }
}

async function seedFromMaterializedDataset(session, definition) {
  const rawScript = await readFile(definition.neo4j.loadDatasetUrl, "utf8");
  const label = definition.entityLabel;
  const script = rawScript.replace(/:Pessoa/g, `:${label}`).replace(/:Diagnostico/g, `:${label}`);
  const statements = parseStatements(script);
  const needsDatasetParam = script.includes("$dataset");
  const params = {};

  if (needsDatasetParam) {
    const dataset = await loadMaterializedDataset(definition);
    params.dataset = dataset;
  }

  if (definition.neo4j?.importConfig) {
    const materializedUrl = await ensureMaterializedFileAvailable(definition);
    params[definition.neo4j.importConfig.parameter] = materializedUrl;
  }

  const isSchemaStatement = (statement) => {
    const normalized = statement.trim().toUpperCase();
    return (
      normalized.startsWith("CREATE CONSTRAINT") ||
      normalized.startsWith("DROP CONSTRAINT") ||
      normalized.startsWith("CREATE INDEX") ||
      normalized.startsWith("DROP INDEX")
    );
  };

  for (const statement of statements) {
    if (isSchemaStatement(statement)) {
      await session.run(statement);
      continue;
    }

    await session.executeWrite((tx) => tx.run(statement, params));
  }
}

function resolveImportDirectory(definition) {
  const importConfig = definition.neo4j?.importConfig;
  if (!importConfig) {
    return null;
  }
  if (importConfig.directory) {
    return importConfig.directory;
  }
  if (importConfig.directoryEnv) {
    const value = process.env[importConfig.directoryEnv];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  const fallback = process.env.NEO4J_IMPORT_DIR;
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }
  return null;
}

async function ensureMaterializedFileAvailable(definition) {
  const importConfig = definition.neo4j?.importConfig;
  if (!importConfig) {
    return null;
  }
  const importDir = resolveImportDirectory(definition);
  if (!importDir) {
    throw new Error(
      `Diretório de importação do Neo4j não configurado para o grafo "${definition.name}". ` +
        `Defina a variável de ambiente ${importConfig.directoryEnv || "NEO4J_IMPORT_DIR"}.`,
    );
  }
  const sourcePath = fileURLToPath(definition.materializedDatasetUrl);
  const targetDir = resolve(importDir);
  const targetPath = resolve(targetDir, importConfig.fileName);
  const cacheKey = `${definition.name}::${targetPath}`;
  if (!importCopyPromises.has(cacheKey)) {
    const promise = (async () => {
      await mkdir(targetDir, { recursive: true });
      if (sourcePath !== targetPath) {
        await copyFile(sourcePath, targetPath);
      }
      return targetPath;
    })().catch((error) => {
      importCopyPromises.delete(cacheKey);
      throw error;
    });
    importCopyPromises.set(cacheKey, promise);
  }
  await importCopyPromises.get(cacheKey);
  return `file:///${importConfig.fileName}`;
}

async function seedDatasetIfNeeded(definition) {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const activeGraph = await getActiveGraphName(session);
    const belongsToDifferentGraph =
      typeof activeGraph === "string" && activeGraph.length > 0 && activeGraph !== definition.name;

    if (belongsToDifferentGraph) {
      console.info(
        `Grafo materializado atual corresponde a "${activeGraph}", limpando base antes de carregar "${definition.name}"...`,
      );
      await clearExistingDataset(session, definition.entityLabel, { full: true });
    } else if (await needsReseeding(session, definition.entityLabel)) {
      console.info(
        `Dataset desatualizado encontrado para grafo "${definition.name}", recriando grafo materializado...`,
      );
      await clearExistingDataset(session, definition.entityLabel);
    }

    if (await hasEntities(session, definition.entityLabel)) {
      if (activeGraph !== definition.name) {
        await setActiveGraphName(session, definition.name);
      }
      return;
    }
    console.info(
      `Neo4j vazio para grafo "${definition.name}", carregando dataset materializado padrão...`,
    );
    await seedFromMaterializedDataset(session, definition);
    await setActiveGraphName(session, definition.name);
  } finally {
    await session.close();
  }
}

export async function ensureDatasetSeeded(definition) {
  if (!definition || !definition.name) {
    throw new Error("Definição de grafo inválida para semeadura");
  }
  const key = definition.name;
  if (!seedingPromises.has(key)) {
    const promise = seedDatasetIfNeeded(definition).catch((error) => {
      seedingPromises.delete(key);
      throw error;
    });
    seedingPromises.set(key, promise);
  }
  return seedingPromises.get(key);
}

export async function reseedDataset(definition) {
  if (!definition || !definition.name) {
    throw new Error("Definição de grafo inválida para recriação do dataset");
  }
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const activeGraph = await getActiveGraphName(session);
    if (typeof activeGraph === "string" && activeGraph.trim().length > 0) {
      if (activeGraph !== definition.name) {
        console.info(
          `Grafo materializado atual corresponde a "${activeGraph}", limpando base antes de carregar "${definition.name}"...`,
        );
      } else {
        console.info(
          `Recriando grafo materializado "${definition.name}" a partir do dataset padrão...`,
        );
      }
    } else {
      console.info(
        `Nenhum grafo materializado ativo encontrado. Preparando carga de "${definition.name}"...`,
      );
    }

    await clearExistingDataset(session, definition.entityLabel, { full: true });
    console.info(
      `Neo4j vazio para grafo "${definition.name}", carregando dataset materializado padrão...`,
    );
    await seedFromMaterializedDataset(session, definition);
    await setActiveGraphName(session, definition.name);
  } finally {
    await session.close();
  }
}
