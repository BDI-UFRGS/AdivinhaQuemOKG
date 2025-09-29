import type { GraphRelationship, KnowledgeGraph } from "../types/knowledgeGraph";
import {
  BASE_VISUALIZATION_CONFIG,
  cloneLinkStyle,
  cloneNodeStyle,
  isValidNodeShape,
  LinkStyle,
  NodeStyle,
  sanitizeColor,
  sanitizeNumber,
  VisualizationConfig,
  VisualizationConfigDTO,
  VisualizationLinkStyleDTO,
  VisualizationNodeStyleDTO,
} from "./types";

export const mergeNodeStyle = (
  base: NodeStyle,
  override?: VisualizationNodeStyleDTO | null,
): NodeStyle => {
  const result: NodeStyle = { ...base };
  if (!override || typeof override !== "object") {
    return result;
  }
  if (isValidNodeShape(override.shape)) {
    result.shape = override.shape;
  }
  const fill = sanitizeColor(override.fill);
  if (fill) {
    result.fill = fill;
  }
  const stroke = sanitizeColor(override.stroke);
  if (stroke) {
    result.stroke = stroke;
  }
  const textColor = sanitizeColor(override.textColor);
  if (textColor) {
    result.textColor = textColor;
  }
  const radius = sanitizeNumber(override.radius);
  if (radius !== undefined) {
    result.radius = radius;
  }
  const width = sanitizeNumber(override.width);
  if (width !== undefined) {
    result.width = width;
  }
  const height = sanitizeNumber(override.height);
  if (height !== undefined) {
    result.height = height;
  }
  const strokeWidth = sanitizeNumber(override.strokeWidth);
  if (strokeWidth !== undefined) {
    result.strokeWidth = strokeWidth;
  }
  const opacity = sanitizeNumber(override.opacity);
  if (opacity !== undefined) {
    const clamped = Math.max(0, Math.min(1, opacity));
    result.opacity = clamped;
  }
  return result;
};

export const mergeLinkStyle = (
  base: LinkStyle,
  override?: VisualizationLinkStyleDTO | null,
): LinkStyle => {
  const result: LinkStyle = { ...base };
  if (!override || typeof override !== "object") {
    return result;
  }
  const color = sanitizeColor(override.color);
  if (color) {
    result.color = color;
  }
  const width = sanitizeNumber(override.width);
  if (width !== undefined) {
    result.width = width;
  }
  const distance = sanitizeNumber(override.distance);
  if (distance !== undefined) {
    result.distance = distance;
  }
  const strength = sanitizeNumber(override.strength);
  if (strength !== undefined) {
    result.strength = strength;
  }
  if (typeof override.description === "string" && override.description.trim().length > 0) {
    result.description = override.description.trim();
  }
  if (typeof override.dasharray === "string" && override.dasharray.trim().length > 0) {
    result.dasharray = override.dasharray.trim();
  } else if (override && Object.prototype.hasOwnProperty.call(override, "dasharray") && !override.dasharray) {
    delete result.dasharray;
  }
  return result;
};

export const buildVisualizationConfig = (
  rawConfig: VisualizationConfigDTO | null | undefined,
  primaryEntityFallback: string,
): VisualizationConfig => {
  const base = BASE_VISUALIZATION_CONFIG;
  const defaultNodeStyle = mergeNodeStyle(base.defaultNodeStyle, rawConfig?.defaultNodeStyle ?? null);

  const nodeStyles: Record<string, NodeStyle> = {};
  Object.entries(base.nodeStyles).forEach(([label, style]) => {
    nodeStyles[label] = cloneNodeStyle(style);
  });
  if (rawConfig?.nodeStyles && typeof rawConfig.nodeStyles === "object") {
    Object.entries(rawConfig.nodeStyles).forEach(([label, style]) => {
      if (!style || typeof style !== "object") {
        return;
      }
      const baseStyle = nodeStyles[label] ?? defaultNodeStyle;
      nodeStyles[label] = mergeNodeStyle(baseStyle, style);
    });
  }

  const defaultLinkStyle = mergeLinkStyle(base.defaultLinkStyle, rawConfig?.defaultLinkStyle ?? null);

  const linkStyles: Record<string, LinkStyle> = {};
  Object.entries(base.linkStyles).forEach(([type, style]) => {
    linkStyles[type] = cloneLinkStyle(style);
  });
  if (rawConfig?.linkStyles && typeof rawConfig.linkStyles === "object") {
    Object.entries(rawConfig.linkStyles).forEach(([type, style]) => {
      if (!style || typeof style !== "object") {
        return;
      }
      const baseStyle = linkStyles[type] ?? { ...defaultLinkStyle, description: type };
      linkStyles[type] = mergeLinkStyle(baseStyle, style);
      if (!linkStyles[type].description.trim()) {
        linkStyles[type].description = type;
      }
    });
  }

  let hiddenRelationshipTypes = [...base.hiddenRelationshipTypes];
  if (Array.isArray(rawConfig?.hiddenRelationshipTypes)) {
    const unique: string[] = [];
    rawConfig.hiddenRelationshipTypes.forEach((value) => {
      if (typeof value !== "string") {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed || unique.includes(trimmed)) {
        return;
      }
      unique.push(trimmed);
    });
    hiddenRelationshipTypes = unique;
  }

  const primaryFallback =
    typeof primaryEntityFallback === "string" && primaryEntityFallback.trim().length > 0
      ? primaryEntityFallback.trim()
      : base.primaryEntityLabel;
  const primaryEntityLabel =
    typeof rawConfig?.primaryEntityLabel === "string" && rawConfig.primaryEntityLabel.trim().length > 0
      ? rawConfig.primaryEntityLabel.trim()
      : primaryFallback;

  return {
    defaultNodeStyle,
    nodeStyles,
    defaultLinkStyle,
    linkStyles,
    hiddenRelationshipTypes,
    primaryEntityLabel,
  };
};

export const sanitizeId = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

export const formatLegendLabel = (value: string): string => value.replace(/_/g, " ");

export const sanitizeRelationshipType = (value: unknown): string =>
  (typeof value === "string" ? value.trim() : "");

export const hashString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
};

export const colorFromHash = (hash: number, attempt: number): string => {
  const hue = Math.floor((hash + attempt * 131) % 360);
  const saturation = 58 + ((hash >> 3) % 22);
  const lightness = 48 + ((hash >> 5) % 14);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

export const pickColorForType = (type: string, usedColors: Set<string>): string => {
  const hash = hashString(type || "relationship");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = colorFromHash(hash, attempt);
    if (!usedColors.has(candidate)) {
      usedColors.add(candidate);
      return candidate;
    }
  }
  const fallback = colorFromHash(hash + usedColors.size * 97, 0);
  usedColors.add(fallback);
  return fallback;
};

export const buildVisualizationWithGraphData = (
  visualization: VisualizationConfig,
  graph: KnowledgeGraph | null,
): VisualizationConfig => {
  const defaultNodeStyle = cloneNodeStyle(visualization.defaultNodeStyle);
  if (defaultNodeStyle.radius === undefined) {
    defaultNodeStyle.radius = 24;
  }
  if (defaultNodeStyle.strokeWidth === undefined) {
    defaultNodeStyle.strokeWidth = 1.5;
  }

  const nodeStyles: Record<string, NodeStyle> = {};
  Object.entries(visualization.nodeStyles).forEach(([label, style]) => {
    nodeStyles[label] = cloneNodeStyle(style);
  });

  const primaryEntityLabel = visualization.primaryEntityLabel;
  const primaryBase = nodeStyles[primaryEntityLabel] ?? defaultNodeStyle;
  const adjustedPrimary = mergeNodeStyle(primaryBase, {
    radius: 30,
    strokeWidth: Math.max(primaryBase.strokeWidth ?? 0, 2),
  });
  const defaultFill = visualization.defaultNodeStyle.fill;
  const defaultStroke = visualization.defaultNodeStyle.stroke;
  if (!adjustedPrimary.fill || adjustedPrimary.fill === defaultFill) {
    adjustedPrimary.fill = "#f97316";
  }
  if (!adjustedPrimary.stroke || adjustedPrimary.stroke === defaultStroke) {
    adjustedPrimary.stroke = "#c2410c";
  }
  nodeStyles[primaryEntityLabel] = adjustedPrimary;

  const defaultLinkStyle = cloneLinkStyle(visualization.defaultLinkStyle);
  const linkStyles: Record<string, LinkStyle> = {};
  Object.entries(visualization.linkStyles).forEach(([type, style]) => {
    const cloned = cloneLinkStyle(style);
    if (!cloned.description || !cloned.description.trim()) {
      cloned.description = formatLegendLabel(type);
    }
    linkStyles[type] = cloned;
  });

  if (graph) {
    const usedColors = new Set<string>(Object.values(linkStyles).map((style) => style.color));
    const hiddenTypes = new Set(visualization.hiddenRelationshipTypes);
    graph.model.relationships
      .map((rel: GraphRelationship) => sanitizeRelationshipType(rel.type))
      .filter((type: string) => type && !hiddenTypes.has(type))
      .forEach((type: string) => {
        if (linkStyles[type]) {
          if (!linkStyles[type].description || !linkStyles[type].description.trim()) {
            linkStyles[type] = {
              ...linkStyles[type],
              description: formatLegendLabel(type),
            };
          }
          return;
        }
        const color = pickColorForType(type, usedColors);
        linkStyles[type] = {
          ...defaultLinkStyle,
          color,
          description: formatLegendLabel(type),
        };
      });
  }

  return {
    defaultNodeStyle,
    nodeStyles,
    defaultLinkStyle,
    linkStyles,
    hiddenRelationshipTypes: [...visualization.hiddenRelationshipTypes],
    primaryEntityLabel,
  };
};
