export type NodeShape = "circle" | "rounded-rect" | "diamond" | "hexagon";

export type NodeStyle = {
  shape: NodeShape;
  fill: string;
  stroke: string;
  textColor: string;
  radius?: number;
  width?: number;
  height?: number;
  strokeWidth?: number;
  opacity?: number;
};

export type LinkStyle = {
  color: string;
  width: number;
  distance: number;
  strength: number;
  dasharray?: string;
  description: string;
};

export type VisualizationNodeStyleDTO = Partial<NodeStyle> & { shape?: NodeShape };

export type VisualizationLinkStyleDTO = Partial<LinkStyle>;

export type VisualizationConfigDTO = {
  readonly defaultNodeStyle?: VisualizationNodeStyleDTO | null;
  readonly nodeStyles?: Record<string, VisualizationNodeStyleDTO | null>;
  readonly defaultLinkStyle?: VisualizationLinkStyleDTO | null;
  readonly linkStyles?: Record<string, VisualizationLinkStyleDTO | null>;
  readonly hiddenRelationshipTypes?: readonly (string | null | undefined)[] | null;
  readonly primaryEntityLabel?: string | null;
};

export type VisualizationConfig = {
  readonly defaultNodeStyle: NodeStyle;
  readonly nodeStyles: Record<string, NodeStyle>;
  readonly defaultLinkStyle: LinkStyle;
  readonly linkStyles: Record<string, LinkStyle>;
  readonly hiddenRelationshipTypes: string[];
  readonly primaryEntityLabel: string;
};

export const BASE_DEFAULT_NODE_STYLE: NodeStyle = {
  shape: "circle",
  fill: "#94a3b8",
  stroke: "#475569",
  textColor: "#0f172a",
  radius: 24,
  strokeWidth: 1.5,
};

export const BASE_NODE_STYLES: Record<string, NodeStyle> = {};

export const BASE_DEFAULT_LINK_STYLE: LinkStyle = {
  color: "#94a3b8",
  width: 1.2,
  distance: 120,
  strength: 0.12,
  description: "Relacionamento",
};

export const BASE_LINK_STYLES: Record<string, LinkStyle> = {};

export const BASE_VISUALIZATION_CONFIG: VisualizationConfig = {
  defaultNodeStyle: BASE_DEFAULT_NODE_STYLE,
  nodeStyles: BASE_NODE_STYLES,
  defaultLinkStyle: BASE_DEFAULT_LINK_STYLE,
  linkStyles: BASE_LINK_STYLES,
  hiddenRelationshipTypes: [],
  primaryEntityLabel: "Entidade",
};

export const VALID_NODE_SHAPES: readonly NodeShape[] = [
  "circle",
  "rounded-rect",
  "diamond",
  "hexagon",
] as const;

export const isValidNodeShape = (value: unknown): value is NodeShape =>
  typeof value === "string" && VALID_NODE_SHAPES.includes(value as NodeShape);

export const sanitizeColor = (value: unknown): string | undefined =>
  (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined);

export const sanitizeNumber = (value: unknown): number | undefined =>
  (typeof value === "number" && Number.isFinite(value) ? value : undefined);

export const cloneNodeStyle = (style: NodeStyle): NodeStyle => ({ ...style });

export const cloneLinkStyle = (style: LinkStyle): LinkStyle => ({ ...style });

export type GuessableNodeSummary = {
  id: string;
  label: string;
  primaryLabel: string;
  properties: Record<string, unknown>;
};
