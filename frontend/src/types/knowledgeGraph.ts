export type ProjectionKind = "entity" | "category" | "attribute" | "value" | "state";

export interface ProjectionNode {
  readonly id: string;
  readonly label: string;
  readonly kind: ProjectionKind;
  readonly group?: string;
}

export interface ProjectionLink {
  readonly source: string;
  readonly target: string;
  readonly type: string;
}

export interface GraphNode {
  readonly id: string;
  readonly labels: string[];
  readonly properties: Record<string, unknown>;
}

export interface GraphRelationship {
  readonly from: string;
  readonly to: string;
  readonly type: string;
  readonly properties?: Record<string, unknown>;
}

export interface GraphModel {
  readonly nodes: GraphNode[];
  readonly relationships: GraphRelationship[];
}

export interface KnowledgeGraphIndexDTO {
  readonly hasState: [string, string[]][];
  readonly attributes: [string, Record<string, unknown>][];
}

export interface KnowledgeGraphIndex {
  readonly hasState: Map<string, Set<string>>;
  readonly attributes: Map<string, Record<string, unknown>>;
}

export interface KnowledgeGraph {
  readonly nodes: ProjectionNode[];
  readonly links: ProjectionLink[];
  readonly index: KnowledgeGraphIndex;
  readonly model: GraphModel;
}

export interface KnowledgeGraphDTO {
  readonly nodes: ProjectionNode[];
  readonly links: ProjectionLink[];
  readonly index: KnowledgeGraphIndexDTO;
  readonly model: GraphModel;
}

export type GNode = ProjectionNode;

export type GLink = ProjectionLink;

export const createEmptyKnowledgeGraph = (): KnowledgeGraph => ({
  nodes: [],
  links: [],
  index: {
    hasState: new Map(),
    attributes: new Map(),
  },
  model: { nodes: [], relationships: [] },
});

export const serializeKnowledgeGraph = (graph: KnowledgeGraph): KnowledgeGraphDTO => ({
  nodes: graph.nodes.map((node) => ({ ...node })),
  links: graph.links.map((link) => ({ ...link })),
  index: {
    hasState: Array.from(graph.index.hasState.entries()).map(([id, values]) => [id, Array.from(values)]),
    attributes: Array.from(graph.index.attributes.entries()).map(([id, attrs]) => [id, { ...attrs }]),
  },
  model: {
    nodes: graph.model.nodes.map((node) => ({
      id: node.id,
      labels: [...node.labels],
      properties: { ...node.properties },
    })),
    relationships: graph.model.relationships.map((rel) => ({
      from: rel.from,
      to: rel.to,
      type: rel.type,
      properties: rel.properties ? { ...rel.properties } : undefined,
    })),
  },
});

export const deserializeKnowledgeGraph = (dto: KnowledgeGraphDTO): KnowledgeGraph => ({
  nodes: dto.nodes.map((node) => ({ ...node })),
  links: dto.links.map((link) => ({ ...link })),
  index: {
    hasState: new Map(dto.index.hasState.map(([id, values]) => [id, new Set(values)])),
    attributes: new Map(dto.index.attributes.map(([id, attrs]) => [id, { ...attrs }])),
  },
  model: {
    nodes: dto.model.nodes.map((node) => ({
      id: node.id,
      labels: [...node.labels],
      properties: { ...node.properties },
    })),
    relationships: dto.model.relationships.map((rel) => ({
      from: rel.from,
      to: rel.to,
      type: rel.type,
      properties: rel.properties ? { ...rel.properties } : undefined,
    })),
  },
});

export const cloneKnowledgeGraph = (graph: KnowledgeGraph): KnowledgeGraph => ({
  nodes: graph.nodes.map((node) => ({ ...node })),
  links: graph.links.map((link) => ({ ...link })),
  index: {
    hasState: new Map(Array.from(graph.index.hasState.entries()).map(([id, values]) => [id, new Set(values)])),
    attributes: new Map(Array.from(graph.index.attributes.entries()).map(([id, attrs]) => [id, { ...attrs }])),
  },
  model: {
    nodes: graph.model.nodes.map((node) => ({
      id: node.id,
      labels: [...node.labels],
      properties: { ...node.properties },
    })),
    relationships: graph.model.relationships.map((rel) => ({
      from: rel.from,
      to: rel.to,
      type: rel.type,
      properties: rel.properties ? { ...rel.properties } : undefined,
    })),
  },
});
