import { isNeo4jInteger, neo4jIntegerToNumber } from "./neo4jClient.js";

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (isNeo4jInteger(value)) {
    return neo4jIntegerToNumber(value);
  }
  if (typeof value === "object") {
    if (typeof value.toString === "function" && value.toString !== Object.prototype.toString) {
      try {
        const stringValue = value.toString();
        if (typeof stringValue === "string" && stringValue !== "[object Object]") {
          return stringValue;
        }
      } catch {}
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizeValue(entryValue)]),
    );
  }
  return value;
}

export function nodeToGraphNode(node) {
  const properties = normalizeValue(node.properties ?? {});
  const id = typeof properties.id === "string" && properties.id.trim() !== "" ? properties.id : node.elementId;
  const labels = Array.isArray(node.labels) ? [...node.labels] : [];
  return {
    id,
    labels,
    properties,
  };
}

export function relationshipToGraphRelationship(relationship, nodeIdResolver) {
  const from = nodeIdResolver(relationship.startNodeElementId);
  const to = nodeIdResolver(relationship.endNodeElementId);
  const properties = normalizeValue(relationship.properties ?? {});
  return {
    from,
    to,
    type: relationship.type,
    properties: Object.keys(properties).length > 0 ? properties : undefined,
  };
}

export function inferProjectionKind(labels) {
  if (labels.includes("Pessoa")) return "entity";
  if (labels.includes("Categoria")) return "category";
  if (labels.includes("Valor")) return "attribute";
  if (labels.includes("Caracteristica")) return "attribute";
  return "state";
}

export function buildProjectionNode(graphNode) {
  const label =
    typeof graphNode.properties.nome === "string"
      ? graphNode.properties.nome
      : typeof graphNode.properties.label === "string"
      ? graphNode.properties.label
      : typeof graphNode.properties.slug === "string"
      ? graphNode.properties.slug
      : graphNode.id;

  const group =
    typeof graphNode.properties.categoriaSlug === "string" && graphNode.properties.categoriaSlug.trim()
      ? graphNode.properties.categoriaSlug.trim()
      : typeof graphNode.properties.categoriaGrupo === "string" && graphNode.properties.categoriaGrupo.trim()
      ? graphNode.properties.categoriaGrupo.trim()
      : typeof graphNode.properties.grupo === "string" && graphNode.properties.grupo.trim()
      ? graphNode.properties.grupo.trim()
      : typeof graphNode.properties.tipo === "string" && graphNode.properties.tipo.trim()
      ? graphNode.properties.tipo.trim()
      : undefined;

  return {
    id: graphNode.id,
    label,
    kind: inferProjectionKind(graphNode.labels),
    group,
  };
}
