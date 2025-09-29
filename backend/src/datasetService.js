import { readFile } from "fs/promises";
import {
  createEmptyKnowledgeGraph,
  serializeKnowledgeGraph,
} from "../../knowledgeGraph/dist/index.js";
import { getNeo4jDriver } from "./neo4jClient.js";
import {
  buildProjectionNode,
  nodeToGraphNode,
  relationshipToGraphRelationship,
} from "./neo4jUtils.js";
import { ensureDatasetSeeded, reseedDataset } from "./datasetSeeder.js";
import { resolveKnowledgeGraphDefinition } from "./knowledgeGraphRegistry.js";

const PRESENCE_VALUE = "SIM";

const graphQueryCache = new Map();

function normalizeQueryText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (line.trim().startsWith("@@") ? "" : line))
    .join("\n")
    .trim();
}

function parseNamedQueries(rawText) {
  const map = new Map();
  const normalized = rawText.replace(/\r\n/g, "\n");
  const regex = /@@\s*name\s*:\s*([A-Za-z0-9_-]+)\s*\n([\s\S]*?)(?=(?:@@\s*name\s*:)|$)/g;
  let match;
  while ((match = regex.exec(normalized)) !== null) {
    const name = match[1].trim();
    let queryText = normalizeQueryText(match[2]);
    if (queryText.endsWith(";")) {
      queryText = queryText.slice(0, -1).trim();
    }
    if (name && queryText) {
      map.set(name, queryText);
    }
  }
  return map;
}

async function loadGraphQueries(definition) {
  if (graphQueryCache.has(definition.name)) {
    return graphQueryCache.get(definition.name);
  }
  if (!definition.neo4j?.backendQueriesUrl) {
    throw new Error(
      `Grafo "${definition.name}" não possui arquivo de consultas backend configurado`,
    );
  }
  let rawQueries;
  try {
    rawQueries = await readFile(definition.neo4j.backendQueriesUrl, "utf8");
  } catch (error) {
    throw new Error(
      `Falha ao carregar consultas do grafo "${definition.name}": ${error.message}`,
    );
  }
  const queries = parseNamedQueries(rawQueries);
  if (queries.size === 0) {
    throw new Error(
      `Nenhuma consulta encontrada no arquivo backend_queries para o grafo "${definition.name}"`,
    );
  }
  graphQueryCache.set(definition.name, queries);
  return queries;
}

function getQuery(definition, queries, name) {
  const query = queries.get(name);
  if (!query) {
    throw new Error(
      `Consulta "${name}" não configurada para o grafo "${definition.name}"`,
    );
  }
  return query;
}

function parseFilterSlug(rawSlug) {
  if (typeof rawSlug !== "string") {
    return { featureSlug: undefined, detailType: null };
  }
  const trimmed = rawSlug.trim();
  if (!trimmed) {
    return { featureSlug: undefined, detailType: null };
  }
  const parts = trimmed.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { featureSlug: parts[0], detailType: parts[1] };
  }
  return { featureSlug: trimmed, detailType: null };
}

async function fetchGroups(session, definition, queries) {
  const query = getQuery(definition, queries, "groups");
  const result = await session.run(query, { entityLabel: definition.entityLabel });
  return result.records.map((record) => {
    const slug = record.get("slug");
    const nome = record.get("nome");
    return {
      key: slug,
      label: typeof nome === "string" && nome.trim() ? nome : slug,
      layout: "option-list",
      description: undefined,
    };
  });
}

async function fetchFeatureMap(session, definition, queries) {
  const query = getQuery(definition, queries, "filters_feature_map");
  const result = await session.run(query, { entityLabel: definition.entityLabel });
  const map = new Map();
  result.records.forEach((record) => {
    const slug = record.get("slug");
    if (typeof slug !== "string" || !slug.trim()) {
      return;
    }
    if (map.has(slug)) {
      return;
    }
    const nome = record.get("nome");
    const categoriaSlug = record.get("categoriaSlug");
    const ordem = record.get("ordem");
    const featureId = record.get("featureId");
    const contexto = record.get("contexto");
    map.set(slug, {
      id: typeof featureId === "string" && featureId.trim() ? featureId.trim() : null,
      slug,
      nome: typeof nome === "string" && nome.trim() ? nome : slug,
      categoriaSlug: typeof categoriaSlug === "string" && categoriaSlug.trim() ? categoriaSlug.trim() : "default",
      ordem: typeof ordem === "number" ? ordem : 0,
      featureRelation: "TEM_TIPO",
      contexto: typeof contexto === "string" && contexto.trim() ? contexto.trim() : null,
    });
  });
  return map;
}

async function fetchDetailOptions(session, definition, queries, { featureId, parentId, contexto }) {
  const query = getQuery(definition, queries, "filters_detail_options");
  const result = await session.run(query, {
    featureId,
    parentId,
    contexto: typeof contexto === "string" && contexto.trim() ? contexto.trim() : null,
  });
  return result.records
    .map((record) => {
      const id = record.get("id");
      const nome = record.get("nome");
      if (typeof id !== "string" || !id.trim()) {
        return null;
      }
      const label = typeof nome === "string" && nome.trim() ? nome : id;
      return { value: id, label };
    })
    .filter(Boolean);
}

async function fetchFilters(session, definition, queries) {
  const featureMap = await fetchFeatureMap(session, definition, queries);
  const filters = [];

  featureMap.forEach((feature) => {
    const contexto =
      typeof feature.contexto === "string" && feature.contexto.trim()
        ? feature.contexto.trim()
        : null;
    filters.push({
      key: feature.slug,
      slug: feature.slug,
      label: feature.nome,
      group: feature.categoriaSlug,
      description: undefined,
      variant: "boolean",
      positiveValue: PRESENCE_VALUE,
      featureId: feature.id ?? feature.slug,
      featureName: feature.nome,
      featureSlug: feature.slug,
      featureRelation: feature.featureRelation ?? undefined,
      detailType: null,
      detailLabel: null,
      detailRelation: null,
      parentSlug: undefined,
      path: [feature.slug],
      contexto,
    });
  });

  const aggregatorQuery = getQuery(definition, queries, "filters_aggregators");
  const aggregatorResult = await session.run(aggregatorQuery, {
    entityLabel: definition.entityLabel,
  });

  for (const record of aggregatorResult.records) {
    const featureSlug = record.get("featureSlug");
    const aggregatorSlug = record.get("aggregatorSlug");
    const aggregatorId = record.get("aggregatorId");
    if (
      typeof featureSlug !== "string" ||
      typeof aggregatorSlug !== "string" ||
      typeof aggregatorId !== "string"
    ) {
      continue;
    }
    const featureEntry = featureMap.get(featureSlug);
    if (!featureEntry) {
      continue;
    }
    const aggregatorNome = record.get("aggregatorNome");
    const contextoRaw = record.get("contexto");
    const contexto =
      typeof contextoRaw === "string" && contextoRaw.trim()
        ? contextoRaw.trim()
        : typeof featureEntry.contexto === "string" && featureEntry.contexto.trim()
        ? featureEntry.contexto.trim()
        : null;
    const featureId =
      typeof featureEntry.id === "string" && featureEntry.id.trim()
        ? featureEntry.id.trim()
        : `cat|${featureSlug}`;
    const label = typeof aggregatorNome === "string" && aggregatorNome.trim() ? aggregatorNome.trim() : aggregatorSlug;
    const options = await fetchDetailOptions(session, definition, queries, {
      featureId,
      parentId: aggregatorId.trim(),
      contexto,
    });
    if (!options.length) {
      continue;
    }
    const detailType = aggregatorSlug.trim();
    filters.push({
      key: `${featureSlug}-${detailType}`,
      slug: `${featureSlug}|${detailType}`,
      label: `${featureEntry.nome} • ${label}`,
      group: featureEntry.categoriaSlug,
      description: undefined,
      variant: "categorical",
      options,
      featureId,
      featureName: featureEntry.nome,
      featureSlug,
      featureRelation: featureEntry.featureRelation ?? undefined,
      detailType,
      detailLabel: label,
      detailRelation: "TEM_TIPO",
      parentSlug: aggregatorSlug.trim(),
      path: [featureSlug, detailType],
      contexto,
    });
  }

  const directQuery = getQuery(definition, queries, "filters_direct");
  const directResult = await session.run(directQuery, {
    entityLabel: definition.entityLabel,
  });

  for (const record of directResult.records) {
    const featureSlug = record.get("featureSlug");
    const featureId = record.get("featureId");
    if (typeof featureSlug !== "string") {
      continue;
    }
    const featureEntry = featureMap.get(featureSlug);
    if (!featureEntry) {
      continue;
    }
    const detailTypeRaw = record.get("detailType");
    const detailLabelRaw = record.get("detailLabel");
    const contextoRaw = record.get("contexto");
    const contexto =
      typeof contextoRaw === "string" && contextoRaw.trim()
        ? contextoRaw.trim()
        : typeof featureEntry.contexto === "string" && featureEntry.contexto.trim()
        ? featureEntry.contexto.trim()
        : null;
    const parentId =
      typeof featureId === "string" && featureId.trim()
        ? featureId.trim()
        : typeof featureEntry.id === "string" && featureEntry.id.trim()
        ? featureEntry.id.trim()
        : `cat|${featureSlug}`;
    const detailType =
      typeof detailTypeRaw === "string" && detailTypeRaw.trim()
        ? detailTypeRaw.trim()
        : "valor";
    const detailLabel = typeof detailLabelRaw === "string" && detailLabelRaw.trim()
      ? detailLabelRaw.trim()
      : featureEntry.nome;
    const options = await fetchDetailOptions(session, definition, queries, {
      featureId: parentId,
      parentId,
      contexto,
    });
    if (!options.length) {
      continue;
    }
    filters.push({
      key: `${featureSlug}-${detailType}`,
      slug: `${featureSlug}|${detailType}`,
      label: `${featureEntry.nome} • ${detailLabel}`,
      group: featureEntry.categoriaSlug,
      description: undefined,
      variant: "categorical",
      options,
      featureId: parentId,
      featureName: featureEntry.nome,
      featureSlug,
      featureRelation: featureEntry.featureRelation ?? undefined,
      detailType,
      detailLabel,
      detailRelation: "TEM_TIPO",
      parentSlug: featureSlug,
      path: [featureSlug, detailType],
      contexto,
    });
  }

  return filters;
}

async function fetchCandidates(session, definition, queries) {
  const query = getQuery(definition, queries, "candidates");
  const result = await session.run(query, { entityLabel: definition.entityLabel });
  return result.records.map((record) => {
    const recordObject = record.toObject();
    const node = recordObject.p ?? recordObject.entity;
    if (!node) {
      return null;
    }
    const graphNode = nodeToGraphNode(node);
    return {
      id: graphNode.id,
      nome: typeof graphNode.properties.nome === "string" ? graphNode.properties.nome : undefined,
      label: typeof graphNode.properties.label === "string" ? graphNode.properties.label : undefined,
      slug: typeof graphNode.properties.slug === "string" ? graphNode.properties.slug : undefined,
      properties: graphNode.properties,
    };
  }).filter(Boolean);
}

async function fetchGraphForCandidates(session, definition, queries, candidateIds) {
  if (candidateIds.length === 0) {
    return serializeKnowledgeGraph(createEmptyKnowledgeGraph());
  }
  const query = getQuery(definition, queries, "graph_for_candidates");
  const result = await session.run(query, {
    ids: candidateIds,
    entityLabel: definition.entityLabel,
  });
  if (result.records.length === 0) {
    return serializeKnowledgeGraph(createEmptyKnowledgeGraph());
  }
  const recordObject = result.records[0].toObject();
  const categorias = Array.isArray(recordObject.categorias)
    ? recordObject.categorias.filter(Boolean)
    : [];
  const valores = Array.isArray(recordObject.valores)
    ? recordObject.valores.filter(Boolean)
    : [];
  const categoriaRels = Array.isArray(recordObject.categoriaRels)
    ? recordObject.categoriaRels.filter(Boolean)
    : [];
  const valorRels = Array.isArray(recordObject.valorRels)
    ? recordObject.valorRels.filter(Boolean)
    : [];

  const entityNodes = (() => {
    const excludedKeys = new Set(["categorias", "valores", "categoriaRels", "valorRels"]);
    for (const [key, value] of Object.entries(recordObject)) {
      if (excludedKeys.has(key)) {
        continue;
      }
      if (!Array.isArray(value)) {
        continue;
      }
      const hasNodeLikeValue = value.some(
        (entry) => entry && typeof entry === "object" && "identity" in entry && "labels" in entry,
      );
      if (hasNodeLikeValue) {
        return value.filter(Boolean);
      }
    }
    return [];
  })();

  const nodes = [...entityNodes, ...categorias, ...valores].filter(Boolean);
  const relationships = [...categoriaRels, ...valorRels].filter(Boolean);

  const graphNodes = nodes.map((node) => nodeToGraphNode(node));
  const idByElement = new Map(nodes.map((node, index) => [node.elementId, graphNodes[index].id]));

  const graphRelationships = relationships
    .map((relationship) =>
      relationshipToGraphRelationship(relationship, (elementId) =>
        idByElement.get(elementId) ?? elementId,
      ),
    )
    .filter((rel) => rel.from && rel.to && rel.type);

  const nodeIds = new Set(graphNodes.map((node) => node.id));
  const filteredRelationships = graphRelationships.filter(
    (rel) => nodeIds.has(rel.from) && nodeIds.has(rel.to),
  );

  const connectedNodeIds = new Set();
  filteredRelationships.forEach((rel) => {
    connectedNodeIds.add(rel.from);
    connectedNodeIds.add(rel.to);
  });
  graphNodes.forEach((node) => {
    if (
      Array.isArray(node.labels) &&
      typeof definition.entityLabel === "string" &&
      definition.entityLabel.trim() &&
      node.labels.includes(definition.entityLabel.trim())
    ) {
      connectedNodeIds.add(node.id);
    }
  });

  const filteredGraphNodes = graphNodes.filter((node) => connectedNodeIds.has(node.id));

  const projectionNodes = filteredGraphNodes.map((node) => buildProjectionNode(node));
  const projectionLinks = filteredRelationships.map((rel) => ({
    source: rel.from,
    target: rel.to,
    type: rel.type,
  }));

  const knowledgeGraph = {
    nodes: projectionNodes,
    links: projectionLinks,
    index: {
      hasState: new Map(),
      attributes: new Map(),
    },
    model: {
      nodes: filteredGraphNodes,
      relationships: filteredRelationships,
    },
  };

  return serializeKnowledgeGraph(knowledgeGraph);
}

function addAvailabilityEntry(map, slug, rawValue) {
  if (typeof slug !== "string" || !slug.trim()) {
    return;
  }
  const trimmedSlug = slug.trim();
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) {
    return;
  }
  let set = map.get(trimmedSlug);
  if (!set) {
    set = new Set();
    map.set(trimmedSlug, set);
  }
  set.add(value);
}

async function fetchAvailability(session, definition, queries, candidateIds) {
  if (!candidateIds.length) {
    return [];
  }
  const availabilityMap = new Map();

  const presenceQuery = getQuery(definition, queries, "availability_presence");
  const presenceResult = await session.run(presenceQuery, {
    ids: candidateIds,
    entityLabel: definition.entityLabel,
  });

  presenceResult.records.forEach((record) => {
    const slug = record.get("featureSlug");
    if (typeof slug === "string" && slug.trim()) {
      addAvailabilityEntry(availabilityMap, slug.trim(), PRESENCE_VALUE);
    }
  });

  const detailQuery = getQuery(definition, queries, "availability_detail");
  const detailResult = await session.run(detailQuery, {
    ids: candidateIds,
    entityLabel: definition.entityLabel,
  });

  detailResult.records.forEach((record) => {
    const featureSlug = record.get("featureSlug");
    const detailType = record.get("detailType");
    const valueId = record.get("valueId");
    if (
      typeof featureSlug !== "string" ||
      typeof detailType !== "string" ||
      typeof valueId !== "string"
    ) {
      return;
    }
    const slug = `${featureSlug.trim()}|${detailType.trim()}`;
    addAvailabilityEntry(availabilityMap, slug, valueId);
  });

  return Array.from(availabilityMap.entries()).map(([slug, set]) => ({
    slug,
    values: Array.from(set.values()).sort((a, b) => a.localeCompare(b, "pt-BR")),
  }));
}

export async function loadDataset(graphName, options = {}) {
  const definition = await resolveKnowledgeGraphDefinition(graphName);
  const forceReload = Boolean(options?.forceReload);
  if (forceReload) {
    await reseedDataset(definition);
  } else {
    await ensureDatasetSeeded(definition);
  }
  const queries = await loadGraphQueries(definition);
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const groups = await fetchGroups(session, definition, queries);
    const filters = await fetchFilters(session, definition, queries);
    const candidates = await fetchCandidates(session, definition, queries);
    const metadata = { groups, filters };
    const ids = candidates.map((candidate) => candidate.id);
    const knowledgeGraph = await fetchGraphForCandidates(
      session,
      definition,
      queries,
      ids,
    );
    const availableFilters = await fetchAvailability(session, definition, queries, ids);
    return {
      graph: {
        name: definition.name,
        title: definition.title,
        description: definition.description || undefined,
        entityLabel: definition.entityLabel,
        visualization: definition.visualization || undefined,
      },
      metadata,
      pessoas: candidates,
      knowledgeGraph,
      availableFilters,
    };
  } finally {
    await session.close();
  }
}

function resolveFilterContext(featureMap, featureSlug) {
  if (!featureMap || !featureMap.has(featureSlug)) {
    return null;
  }
  const entry = featureMap.get(featureSlug);
  if (!entry) {
    return null;
  }
  return typeof entry.contexto === "string" && entry.contexto.trim() ? entry.contexto.trim() : null;
}

function buildFilterConditions(appliedFilters, featureMap) {
  if (!Array.isArray(appliedFilters) || appliedFilters.length === 0) {
    return [];
  }
  return appliedFilters.map((filter) => {
    const parsed = parseFilterSlug(filter.slug);
    const featureSlug = parsed.featureSlug ?? filter.slug;
    const detailType = parsed.detailType ?? null;
    const contexto = resolveFilterContext(featureMap, featureSlug);
    return {
      slug: filter.slug,
      featureSlug,
      detailType,
      value: filter.value,
      condition: filter.condition === "DIFERENTE" ? "DIFERENTE" : "IGUAL",
      kind: detailType ? "detail" : "presence",
      contexto,
    };
  });
}

async function askTarget(session, definition, queries, featureMap, alvoId, slug, value) {
  const parsed = parseFilterSlug(slug);
  const featureSlug = parsed.featureSlug ?? slug;
  const detailType = parsed.detailType ?? null;
  const contexto = resolveFilterContext(featureMap, featureSlug);

  if (detailType) {
    const query = getQuery(definition, queries, "question_detail");
    const result = await session.run(query, {
      alvoId,
      valorId: value,
      contexto,
    });
    if (result.records.length === 0) {
      return null;
    }
    const valorId = result.records[0].get("valorSelecionado");
    return typeof valorId === "string" ? valorId : null;
  }

  const query = getQuery(definition, queries, "question_presence");
  const result = await session.run(query, {
    alvoId,
    presence: PRESENCE_VALUE,
    entityLabel: definition.entityLabel,
    contexto,
  });
  if (result.records.length === 0) {
    return null;
  }
  const valor = result.records[0].get("resposta");
  return typeof valor === "string" ? valor : null;
}

async function fetchCandidatesByFilters(session, definition, queries, filterConditions) {
  if (!filterConditions.length) {
    return fetchCandidates(session, definition, queries);
  }
  const presenceConds = filterConditions.filter((entry) => entry.kind === "presence");
  const detailConds = filterConditions.filter((entry) => entry.kind === "detail");
  const query = getQuery(definition, queries, "filters_apply");
  const result = await session.run(query, {
    presenceConds,
    detailConds,
    entityLabel: definition.entityLabel,
  });
  return result.records
    .map((record) => {
      const recordObject = record.toObject();
      const node = recordObject.p ?? recordObject.entity;
      if (!node) {
        return null;
      }
      const graphNode = nodeToGraphNode(node);
      return {
        id: graphNode.id,
        nome:
          typeof graphNode.properties.nome === "string"
            ? graphNode.properties.nome
            : undefined,
        label:
          typeof graphNode.properties.label === "string"
            ? graphNode.properties.label
            : undefined,
        slug:
          typeof graphNode.properties.slug === "string"
            ? graphNode.properties.slug
            : undefined,
        properties: graphNode.properties,
      };
    })
    .filter(Boolean);
}

export async function applyQuestion({
  alvoId,
  slug,
  value,
  appliedFilters,
  graphName,
}) {
  const definition = await resolveKnowledgeGraphDefinition(graphName);
  await ensureDatasetSeeded(definition);
  const queries = await loadGraphQueries(definition);
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const featureMap = await fetchFeatureMap(session, definition, queries);
    const filterConditions = buildFilterConditions(appliedFilters, featureMap);
    const valorAlvo = await askTarget(session, definition, queries, featureMap, alvoId, slug, value);
    const resposta = valorAlvo === value ? "SIM" : "NÃO";
    const newCondition = resposta === "SIM" ? "IGUAL" : "DIFERENTE";
    const parsed = parseFilterSlug(slug);
    const contexto = resolveFilterContext(featureMap, parsed.featureSlug ?? slug);
    const nextConditions = [
      ...filterConditions,
      {
        slug,
        featureSlug: parsed.featureSlug ?? slug,
        detailType: parsed.detailType ?? null,
        value,
        condition: newCondition,
        kind: parsed.detailType ? "detail" : "presence",
        contexto,
      },
    ];
    const candidatos = await fetchCandidatesByFilters(
      session,
      definition,
      queries,
      nextConditions,
    );
    const ids = candidatos.map((candidate) => candidate.id);
    const knowledgeGraph = await fetchGraphForCandidates(
      session,
      definition,
      queries,
      ids,
    );
    const availableFilters = await fetchAvailability(session, definition, queries, ids);
    return {
      resposta,
      filtrosAplicados: [...appliedFilters, { slug, value, condition: newCondition }],
      pessoas: candidatos,
      knowledgeGraph,
      availableFilters,
      graph: {
        name: definition.name,
        title: definition.title,
        description: definition.description || undefined,
        entityLabel: definition.entityLabel,
        visualization: definition.visualization || undefined,
      },
    };
  } finally {
    await session.close();
  }
}
