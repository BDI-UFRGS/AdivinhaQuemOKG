import { readdir, readFile } from "fs/promises";

const KNOWLEDGE_GRAPH_ROOT_URL = new URL("../../knowledgeGraph/", import.meta.url);
const NEO4J_ROOT_URL = new URL("./neo4j/", KNOWLEDGE_GRAPH_ROOT_URL);
const MATERIALIZED_ROOT_URL = new URL("./materialized/", KNOWLEDGE_GRAPH_ROOT_URL);

let cachedDefinitions = null;

function isValidIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function isValidDirectoryName(value) {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function isValidFileName(value) {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function ensureMaterializedFileName(rawName, fallbackName) {
  const normalized = normalizeString(rawName) || fallbackName;
  if (!isValidFileName(normalized)) {
    throw new Error(`Nome de arquivo do dataset materializado inválido: ${normalized}`);
  }
  return normalized;
}

function buildImportConfig(rawImport, materializedFileName, graphName) {
  if (!rawImport || typeof rawImport !== "object" || Array.isArray(rawImport)) {
    return null;
  }
  const fileName = ensureMaterializedFileName(rawImport.fileName, materializedFileName);
  const parameterName = normalizeString(rawImport.parameter) || "materializedUrl";
  if (!isValidIdentifier(parameterName)) {
    console.warn(
      `Nome de parâmetro Cypher inválido para importação do grafo ${graphName}: ${parameterName}`,
    );
    return null;
  }
  const directory = normalizeString(rawImport.directory) || null;
  const directoryEnv = normalizeString(rawImport.directoryEnv) || null;
  return {
    fileName,
    parameter: parameterName,
    directory,
    directoryEnv,
  };
}

async function loadGraphDefinitionFromDirectory(dirName) {
  if (!isValidDirectoryName(dirName)) {
    return null;
  }
  const graphDirUrl = new URL(`./${dirName}/`, NEO4J_ROOT_URL);
  const configUrl = new URL("./config.json", graphDirUrl);

  let rawConfig;
  try {
    rawConfig = await readFile(configUrl, "utf8");
  } catch (error) {
    console.warn(`Ignorando diretório de grafo sem config.json: ${dirName}`);
    return null;
  }

  let config;
  try {
    config = JSON.parse(rawConfig);
  } catch (error) {
    console.warn(`Configuração inválida para grafo ${dirName}: ${error.message}`);
    return null;
  }

  const name = normalizeString(config.name) || dirName;
  if (!isValidDirectoryName(name)) {
    console.warn(`Nome interno inválido para grafo ${dirName}: ${name}`);
    return null;
  }

  const title = normalizeString(config.title) || name;
  const description = normalizeString(config.description) || "";
  const entityLabel = normalizeString(config.entityLabel) || "Pessoa";
  if (!isValidIdentifier(entityLabel)) {
    console.warn(`Rótulo de entidade inválido para grafo ${name}: ${entityLabel}`);
    return null;
  }

  const materializedFileName = ensureMaterializedFileName(config.materializedDataset, `${name}.json`);
  const isDefault = Boolean(config.default ?? config.isDefault);

  const materializedDatasetUrl = new URL(`./${materializedFileName}`, MATERIALIZED_ROOT_URL);

  const visualizationConfig =
    config.visualization && typeof config.visualization === "object" && !Array.isArray(config.visualization)
      ? JSON.parse(JSON.stringify(config.visualization))
      : null;

  const importConfig = buildImportConfig(config.import, materializedFileName, name);

  return {
    name,
    title,
    description,
    entityLabel,
    isDefault,
    materializedDatasetUrl,
    materializedFileName,
    visualization: visualizationConfig,
    neo4j: {
      directoryUrl: graphDirUrl,
      loadDatasetUrl: new URL("./load_dataset.cypher", graphDirUrl),
      schemaUrl: new URL("./schema.cypher", graphDirUrl),
      filtersQueryUrl: new URL("./queries_filtros.cypher", graphDirUrl),
      visualizationQueryUrl: new URL("./queries_visualizacao.cypher", graphDirUrl),
      backendQueriesUrl: new URL("./backend_queries.cypher", graphDirUrl),
      importConfig,
    },
  };
}

async function loadGraphDefinitions() {
  if (cachedDefinitions) {
    return cachedDefinitions;
  }
  let entries;
  try {
    entries = await readdir(NEO4J_ROOT_URL, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Falha ao listar grafos disponíveis: ${error.message}`);
  }
  const definitions = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const definition = await loadGraphDefinitionFromDirectory(entry.name);
    if (definition) {
      definitions.push(definition);
    }
  }
  definitions.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  cachedDefinitions = definitions;
  return cachedDefinitions;
}

export async function listKnowledgeGraphs() {
  const definitions = await loadGraphDefinitions();
  return definitions.map((definition) => ({
    name: definition.name,
    title: definition.title,
    description: definition.description,
    default: definition.isDefault,
  }));
}

export async function resolveKnowledgeGraphDefinition(name) {
  const definitions = await loadGraphDefinitions();
  if (definitions.length === 0) {
    throw new Error("Nenhum grafo de conhecimento configurado");
  }
  if (name) {
    const normalized = normalizeString(name);
    const definition = definitions.find((entry) => entry.name === normalized);
    if (!definition) {
      const error = new Error(`Grafo desconhecido: ${name}`);
      error.code = "GRAPH_NOT_FOUND";
      throw error;
    }
    return definition;
  }
  const defaultGraph = definitions.find((entry) => entry.isDefault);
  if (defaultGraph) {
    return defaultGraph;
  }
  return definitions[0];
}

export async function getDefaultKnowledgeGraphDefinition() {
  return resolveKnowledgeGraphDefinition(null);
}

export function invalidateKnowledgeGraphCache() {
  cachedDefinitions = null;
}
