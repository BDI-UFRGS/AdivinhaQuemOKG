import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import type {
  GLink,
  GNode,
  GraphModel,
  GraphNode,
  GraphRelationship,
} from "../types/knowledgeGraph";
import type {
  GuessableNodeSummary,
  LinkStyle,
  NodeStyle,
  VisualizationConfig,
} from "../visualization/types";
import { formatLegendLabel, sanitizeId } from "../visualization/config";
import { formatValue } from "../utils/value";

const getLinkDetailText = (properties: Record<string, unknown>): string => {
  const baseLabel = typeof properties.label === "string" ? properties.label.trim() : "";
  if (baseLabel) return baseLabel;
  const nome = typeof properties.caracteristicaNome === "string" ? properties.caracteristicaNome : undefined;
  const valorLabel =
    typeof properties.valorLabel === "string"
      ? properties.valorLabel
      : typeof properties.valor === "string"
      ? properties.valor
      : undefined;
  if (nome && valorLabel) return `${nome}: ${valorLabel}`;
  if (nome) return nome;
  if (valorLabel) return valorLabel;
  return "";
};

const createDiamondPath = (radius: number): string => `M0,-${radius} L${radius},0 L0,${radius} L-${radius},0 Z`;

const createPolygonPath = (sides: number, radius: number): string => {
  let path = "";
  for (let i = 0; i < sides; i += 1) {
    const angle = Math.PI / 2 + (i * (Math.PI * 2)) / sides;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    path += `${i === 0 ? "M" : "L"}${x},${y}`;
  }
  return `${path}Z`;
};

type ForceNode = d3.SimulationNodeDatum & {
  id: string;
  label: string;
  labels: string[];
  properties: Record<string, unknown>;
  primaryLabel: string;
  kind?: GNode["kind"];
  group?: string;
  projectionDegree?: number;
  depth?: number;
};

type ForceLink = d3.SimulationLinkDatum<ForceNode> & {
  type: string;
  properties: Record<string, unknown>;
  color: string;
  width: number;
  distance: number;
  strength: number;
  markerId: string;
  dasharray?: string;
  label: string;
  detail?: string;
};

type ForceGraphProps = {
  nodes: GNode[];
  links: GLink[];
  model: GraphModel;
  visualization: VisualizationConfig;
  guessableNodeLabels?: readonly string[];
  canGuess?: boolean;
  onNodeGuessRequest?: (node: GuessableNodeSummary) => void;
};

const collisionRadius = (node: ForceNode, style: NodeStyle): number => {
  if (style.shape === "circle") {
    return (style.radius ?? 24) + 6;
  }
  if (style.shape === "diamond") {
    return (style.radius ?? 22) * 1.4;
  }
  if (style.shape === "hexagon") {
    return (style.radius ?? 30) + 6;
  }
  if (style.shape === "rounded-rect") {
    const widthRect = style.width ?? 120;
    const heightRect = style.height ?? 36;
    return Math.max(widthRect, heightRect) / 2 + 8;
  }
  return (style.radius ?? 24) + 6;
};

const ForceGraph: React.FC<ForceGraphProps> = ({
  nodes,
  links,
  model,
  visualization,
  guessableNodeLabels,
  canGuess = false,
  onNodeGuessRequest,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = 1180;
  const height = 760;

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const svg = d3.select(svgElement);
    svg.selectAll("*").remove();

    const container = d3.select(svgElement.parentElement as HTMLElement);
    container.style("position", "relative");

    const tooltip = container
      .append("div")
      .attr("class", "force-graph-tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "rgba(15, 23, 42, 0.92)")
      .style("color", "#f8fafc")
      .style("padding", "8px 12px")
      .style("border-radius", "10px")
      .style("font-size", "12px")
      .style("line-height", "1.2")
      .style("box-shadow", "0 12px 24px rgba(15, 23, 42, 0.25)")
      .style("opacity", "0");

    const hiddenRelationshipTypes = new Set(visualization.hiddenRelationshipTypes);
    const guessableLabelSet = new Set(
      (guessableNodeLabels ?? [])
        .map((label) => (typeof label === "string" ? label.trim().toUpperCase() : ""))
        .filter((label) => label.length > 0),
    );

    const isGuessableNode = (node: ForceNode): boolean => {
      if (!canGuess || guessableLabelSet.size === 0) {
        return false;
      }
      const normalizedLabels = node.labels
        .map((label) => (typeof label === "string" ? label.trim().toUpperCase() : ""))
        .filter((label) => label.length > 0);
      if (typeof node.primaryLabel === "string") {
        const normalizedPrimary = node.primaryLabel.trim().toUpperCase();
        if (normalizedPrimary) {
          normalizedLabels.push(normalizedPrimary);
        }
      }
      return normalizedLabels.some((label) => guessableLabelSet.has(label));
    };

    const getNodeStyle = (node: ForceNode): NodeStyle =>
      visualization.nodeStyles[node.primaryLabel] ?? visualization.defaultNodeStyle;
    const getLinkStyle = (type: string): LinkStyle =>
      visualization.linkStyles[type] ?? visualization.defaultLinkStyle;

    const primaryEntityLabel = visualization.primaryEntityLabel;
    const matchesPrimaryLabel = (node: ForceNode): boolean =>
      Boolean(primaryEntityLabel) &&
      (node.labels.includes(primaryEntityLabel) || node.primaryLabel === primaryEntityLabel);

    const projectionById = new Map(nodes.map((node) => [node.id, node]));
    const projectionDegrees = new Map<string, number>();
    links.forEach((link) => {
      projectionDegrees.set(link.source, (projectionDegrees.get(link.source) ?? 0) + 1);
      projectionDegrees.set(link.target, (projectionDegrees.get(link.target) ?? 0) + 1);
    });

    const modelNodes: GraphNode[] = Array.isArray(model.nodes) ? model.nodes : [];
    const modelRelationships: GraphRelationship[] = Array.isArray(model.relationships)
      ? model.relationships
      : [];

    const relevantModelNodes = modelNodes;

    const forceNodes: ForceNode[] = relevantModelNodes.map((node) => {
      const projection = projectionById.get(node.id);
      const label =
        typeof node.properties.nome === "string"
          ? String(node.properties.nome)
          : typeof node.properties.id === "string"
          ? String(node.properties.id)
          : node.id;

      return {
        id: node.id,
        label,
        labels: node.labels,
        properties: node.properties,
        primaryLabel: node.labels[0] ?? "Nó",
        kind: projection?.kind,
        group: projection?.group,
        projectionDegree: projectionDegrees.get(node.id),
      };
    });

    if (forceNodes.length === 0) {
      tooltip.remove();
      return;
    }

    const nodeById = new Map(forceNodes.map((node) => [node.id, node]));

    const forceLinks: ForceLink[] = modelRelationships
      .filter(
        (rel) =>
          nodeById.has(rel.from) &&
          nodeById.has(rel.to) &&
          !hiddenRelationshipTypes.has(rel.type),
      )
      .map((rel) => {
        const style = getLinkStyle(rel.type);
        const markerKey = sanitizeId(rel.type);
        const properties = rel.properties ?? {};
        const descriptiveText = getLinkDetailText(properties);
        const customDetail = typeof properties.detail === "string" ? properties.detail.trim() : "";
        const detailParts: string[] = [];
        if (descriptiveText) detailParts.push(descriptiveText);
        if (customDetail) detailParts.push(customDetail);
        const detail = detailParts.join(" • ");
        const label = style.description && style.description.trim().length > 0 ? style.description.trim() : rel.type;
        return {
          source: rel.from,
          target: rel.to,
          type: rel.type,
          properties,
          color: style.color,
          width: style.width,
          distance: style.distance,
          strength: style.strength,
          markerId: `arrow-${markerKey}`,
          dasharray: style.dasharray,
          label,
          detail: detail || undefined,
        };
      });

    const adjacency = new Map<string, Set<string>>();
    forceLinks.forEach((link) => {
      const sourceId = typeof link.source === "string" ? link.source : (link.source as ForceNode).id;
      const targetId = typeof link.target === "string" ? link.target : (link.target as ForceNode).id;
      if (!adjacency.has(sourceId)) {
        adjacency.set(sourceId, new Set());
      }
      if (!adjacency.has(targetId)) {
        adjacency.set(targetId, new Set());
      }
      adjacency.get(sourceId)?.add(targetId);
      adjacency.get(targetId)?.add(sourceId);
    });

    const depthByNode = new Map<string, number>();
    const queue: string[] = [];
    forceNodes.forEach((node) => {
      if (matchesPrimaryLabel(node)) {
        depthByNode.set(node.id, 0);
        queue.push(node.id);
      }
    });
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const currentDepth = depthByNode.get(current) ?? 0;
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      neighbors.forEach((neighbor) => {
        if (!depthByNode.has(neighbor)) {
          depthByNode.set(neighbor, currentDepth + 1);
          queue.push(neighbor);
        }
      });
    }

    const nodesByDepth = new Map<number, ForceNode[]>();
    forceNodes.forEach((node) => {
      const depth = depthByNode.get(node.id) ?? 1;
      node.depth = depth;
      const list = nodesByDepth.get(depth) ?? [];
      list.push(node);
      nodesByDepth.set(depth, list);
    });

    const radiusStep = 170;
    nodesByDepth.forEach((nodesAtDepth, depth) => {
      const baseRadius = depth === 0 ? 40 : radiusStep * depth;
      nodesAtDepth.forEach((node, index) => {
        const angle = nodesAtDepth.length > 0 ? (index / nodesAtDepth.length) * Math.PI * 2 : 0;
        node.x = width / 2 + Math.cos(angle) * baseRadius;
        node.y = height / 2 + Math.sin(angle) * baseRadius;
      });
    });

    const defs = svg.append("defs");
    const markerMap = new Map<string, { markerId: string; color: string }>();
    forceLinks.forEach((link) => {
      if (!markerMap.has(link.markerId)) {
        markerMap.set(link.markerId, { markerId: link.markerId, color: link.color });
      }
    });

    markerMap.forEach(({ markerId, color }) => {
      defs
        .append("marker")
        .attr("id", markerId)
        .attr("viewBox", "0 -4 8 8")
        .attr("refX", 14)
        .attr("refY", 0)
        .attr("markerWidth", 8)
        .attr("markerHeight", 8)
        .attr("orient", "auto")
        .attr("markerUnits", "strokeWidth")
        .append("path")
        .attr("d", "M0,-4L8,0L0,4")
        .attr("fill", color)
        .attr("opacity", 0.9);
    });

    const zoomLayer = svg.append("g").attr("class", "force-graph");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 2.5])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
      });
    svg.call(zoom as any);

    const linkSelection = zoomLayer
      .append("g")
      .attr("class", "links")
      .selectAll<SVGLineElement, ForceLink>("line")
      .data(forceLinks)
      .enter()
      .append("line")
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", (d) => d.width)
      .attr("stroke-opacity", 0.85)
      .attr("stroke-dasharray", (d) => d.dasharray ?? null)
      .attr("marker-end", (d) => `url(#${d.markerId})`);

    const linkLabelSelection = zoomLayer
      .append("g")
      .attr("class", "link-labels")
      .selectAll<SVGTextElement, ForceLink>("text")
      .data(forceLinks)
      .enter()
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", -8)
      .style("font-size", "11px")
      .style("fill", "#0f172a")
      .style("font-weight", 700)
      .style("pointer-events", "none")
      .style("paint-order", "stroke")
      .style("stroke", "rgba(255,255,255,0.92)")
      .style("stroke-width", "3px")
      .style("stroke-opacity", 0.9)
      .text((d) => (d.label ? `(${d.label})` : ""))
      .style("display", (d) => (d.label ? null : "none"));

    linkSelection
      .append("title")
      .text((d) => {
        const detail = d.detail ? `\n${d.detail}` : "";
        return `${d.type}${detail}`;
      });

    const nodeSelection = zoomLayer
      .append("g")
      .attr("class", "nodes")
      .selectAll<SVGGElement, ForceNode>("g")
      .data(forceNodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", (d) => (isGuessableNode(d) ? "pointer" : "grab"));

    nodeSelection.each(function (d) {
      const sel = d3.select<SVGGElement, ForceNode>(this);
      sel.style("cursor", isGuessableNode(d) ? "pointer" : "grab");
      const style = getNodeStyle(d);
      const strokeWidth = style.strokeWidth ?? 1.4;
      const fillOpacity = style.opacity ?? 1;

      if (style.shape === "circle") {
        const radius = style.radius ?? 22;
        sel
          .append("circle")
          .attr("r", radius)
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      } else if (style.shape === "rounded-rect") {
        const widthRect = style.width ?? 120;
        const heightRect = style.height ?? 36;
        sel
          .append("rect")
          .attr("x", -widthRect / 2)
          .attr("y", -heightRect / 2)
          .attr("width", widthRect)
          .attr("height", heightRect)
          .attr("rx", 14)
          .attr("ry", 14)
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      } else if (style.shape === "diamond") {
        const radius = style.radius ?? 22;
        sel
          .append("path")
          .attr("d", createDiamondPath(radius))
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      } else if (style.shape === "hexagon") {
        const radius = style.radius ?? 30;
        sel
          .append("path")
          .attr("d", createPolygonPath(6, radius))
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      } else {
        const radius = style.radius ?? 22;
        sel
          .append("circle")
          .attr("r", radius)
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      }

      if (matchesPrimaryLabel(d)) {
        const baseRadius = style.radius ?? 24;
        const typeOffset =
          style.shape === "rounded-rect"
            ? (style.height ?? 36) / 2 + 16
            : style.shape === "diamond" || style.shape === "hexagon"
            ? baseRadius * 1.2 + 12
            : baseRadius + 16;
        const typeLabel = String(primaryEntityLabel).toUpperCase();
        sel
          .append("text")
          .attr("text-anchor", "middle")
          .attr("y", -typeOffset)
          .attr("fill", "#475569")
          .style("font-size", "9px")
          .style("font-weight", 600)
          .style("letter-spacing", "0.6px")
          .text(typeLabel);
      }

      sel
        .append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("fill", style.textColor)
        .style("font-size", "11px")
        .style("font-weight", 600)
        .style("pointer-events", "none")
        .style("paint-order", "stroke")
        .style("stroke", style.textColor === "#f8fafc" ? "rgba(15,23,42,0.35)" : "transparent")
        .style("stroke-width", style.textColor === "#f8fafc" ? "0.6px" : "0px")
        .text(d.label);
    });

    const primaryNodeStyle = visualization.nodeStyles[primaryEntityLabel] ?? visualization.defaultNodeStyle;
    const hasPrimaryNodes = forceNodes.some((node) => matchesPrimaryLabel(node));
    const hasOtherNodes = forceNodes.some((node) => !matchesPrimaryLabel(node));
    const nodeLegendEntries: { label: string; style: NodeStyle }[] = [];
    if (hasPrimaryNodes) {
      const samplePrimary = forceNodes.find((node) => matchesPrimaryLabel(node));
      nodeLegendEntries.push({ label: primaryEntityLabel, style: samplePrimary ? getNodeStyle(samplePrimary) : primaryNodeStyle });
    } else if (forceNodes.length > 0) {
      nodeLegendEntries.push({ label: primaryEntityLabel, style: primaryNodeStyle });
    }
    if (hasOtherNodes) {
      nodeLegendEntries.push({ label: "Demais nós", style: visualization.defaultNodeStyle });
    }

    const legendNodes = svg
      .append("g")
      .attr("class", "legend legend-nodes")
      .attr("transform", "translate(16,16)");

    legendNodes
      .append("text")
      .text("Nós")
      .attr("x", 0)
      .attr("y", 0)
      .style("font-size", "12px")
      .style("font-weight", 600)
      .style("fill", "#1f2937");

    const nodeLegendItems = legendNodes
      .selectAll<SVGGElement, { label: string; style: NodeStyle }>("g.legend-item")
      .data(nodeLegendEntries)
      .enter()
      .append("g")
      .attr("class", "legend-item")
      .attr("transform", (_, i) => `translate(0, ${18 + i * 32})`);

    nodeLegendItems.each(function (d) {
      const sel = d3.select<SVGGElement, { label: string; style: NodeStyle }>(this);
      const shapeGroup = sel.append("g").attr("transform", "translate(14, 12)");
      const style = d.style;
      const strokeWidth = (style.strokeWidth ?? 1.4) * 0.9;
      const fillOpacity = style.opacity ?? 1;

      if (style.shape === "circle") {
        const radius = (style.radius ?? 22) * 0.55;
        shapeGroup
          .append("circle")
          .attr("r", radius)
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      } else if (style.shape === "rounded-rect") {
        const widthRect = (style.width ?? 120) * 0.45;
        const heightRect = (style.height ?? 36) * 0.45;
        shapeGroup
          .append("rect")
          .attr("x", -widthRect / 2)
          .attr("y", -heightRect / 2)
          .attr("width", widthRect)
          .attr("height", heightRect)
          .attr("rx", 8)
          .attr("ry", 8)
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      } else if (style.shape === "diamond") {
        const radius = (style.radius ?? 22) * 0.55;
        shapeGroup
          .append("path")
          .attr("d", createDiamondPath(radius))
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      } else if (style.shape === "hexagon") {
        const radius = (style.radius ?? 30) * 0.55;
        shapeGroup
          .append("path")
          .attr("d", createPolygonPath(6, radius))
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      } else {
        const radius = (style.radius ?? 22) * 0.55;
        shapeGroup
          .append("circle")
          .attr("r", radius)
          .attr("fill", style.fill)
          .attr("fill-opacity", fillOpacity)
          .attr("stroke", style.stroke)
          .attr("stroke-width", strokeWidth);
      }

      sel
        .append("text")
        .attr("x", 36)
        .attr("y", 6)
        .style("font-size", "11px")
        .style("fill", "#1f2937")
        .style("font-weight", 500)
        .text(formatLegendLabel(d.label));
    });

    const radialForce = d3
      .forceRadial<ForceNode>((node) => {
        const depth = node.depth ?? 1;
        return depth === 0 ? 40 : radiusStep * depth;
      }, width / 2, height / 2)
      .strength(0.85);

    const simulation = d3
      .forceSimulation<ForceNode>(forceNodes)
      .force(
        "link",
        d3
          .forceLink<ForceNode, ForceLink>(forceLinks)
          .id((d) => d.id)
          .distance((link) => link.distance)
          .strength((link) => link.strength),
      )
      .force("charge", d3.forceManyBody<ForceNode>().strength(-220))
      .force(
        "collision",
        d3.forceCollide<ForceNode>().radius((node) => collisionRadius(node, getNodeStyle(node))).strength(0.9),
      )
      .force("radial", radialForce)
      .force("x", d3.forceX<ForceNode>(width / 2).strength(0.05))
      .force("y", d3.forceY<ForceNode>(height / 2).strength(0.05))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .alpha(0.9)
      .on("tick", () => {
        linkSelection
          .attr("x1", (d) => {
            const source = d.source as ForceNode;
            return typeof source.x === "number" ? source.x : 0;
          })
          .attr("y1", (d) => {
            const source = d.source as ForceNode;
            return typeof source.y === "number" ? source.y : 0;
          })
          .attr("x2", (d) => {
            const target = d.target as ForceNode;
            return typeof target.x === "number" ? target.x : 0;
          })
          .attr("y2", (d) => {
            const target = d.target as ForceNode;
            return typeof target.y === "number" ? target.y : 0;
          });

        linkLabelSelection
          .attr(
            "x",
            (d) => {
              const source = d.source as ForceNode;
              const target = d.target as ForceNode;
              const x1 = typeof source.x === "number" ? source.x : 0;
              const x2 = typeof target.x === "number" ? target.x : 0;
              return (x1 + x2) / 2;
            },
          )
          .attr(
            "y",
            (d) => {
              const source = d.source as ForceNode;
              const target = d.target as ForceNode;
              const y1 = typeof source.y === "number" ? source.y : 0;
              const y2 = typeof target.y === "number" ? target.y : 0;
              return (y1 + y2) / 2;
            },
          )
          .style("display", (d) => (d.label ? null : "none"));

        nodeSelection.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    const dragBehaviour = d3
      .drag<SVGGElement, ForceNode>()
      .on("start", function (event, datum) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        datum.fx = datum.x;
        datum.fy = datum.y;
        d3.select(this).style("cursor", "grabbing");
      })
      .on("drag", function (event, datum) {
        datum.fx = event.x;
        datum.fy = event.y;
      })
      .on("end", function (event, datum) {
        if (!event.active) simulation.alphaTarget(0);
        datum.fx = undefined;
        datum.fy = undefined;
        d3.select(this).style("cursor", isGuessableNode(datum) ? "pointer" : "grab");
      });

    nodeSelection.call(dragBehaviour as any);

    nodeSelection
      .on("mouseenter", function (event, datum) {
        const containerNode = container.node();
        if (!containerNode) return;
        const [x, y] = d3.pointer(event, containerNode);
        const propertyEntries = Object.entries(datum.properties ?? {})
          .filter(([, value]) => value !== undefined && value !== null && value !== "")
          .slice(0, 6);

        const propertiesHtml = propertyEntries
          .map(
            ([key, value]) =>
              `<div style="margin-top:2px;"><span style="color:#94a3b8;">${key}</span>: <span style="color:#e2e8f0;">${formatValue(value)}</span></div>`,
          )
          .join("");

        const degreeInfo =
          typeof datum.projectionDegree === "number"
            ? `<div style="margin-top:6px;font-size:11px;color:rgba(148,163,184,0.85);">Projeção: ${datum.projectionDegree} ligação(ões)</div>`
            : "";

        d3.select(this).style("cursor", isGuessableNode(datum) ? "pointer" : "grab");

        tooltip
          .style("opacity", "1")
          .style("left", `${x + 18}px`)
          .style("top", `${y + 18}px`)
          .html(
            `<div style="font-weight:600;margin-bottom:4px;">${datum.label}</div>` +
              `<div style="font-size:11px;color:rgba(148,163,184,0.9);margin-bottom:4px;">${datum.labels.join(", ")}</div>` +
              `<div style="font-size:11px;color:rgba(226,232,240,0.8);">id: <strong>${datum.id}</strong></div>` +
              degreeInfo +
              (propertiesHtml ? `<div style="margin-top:6px;font-size:11px;">${propertiesHtml}</div>` : ""),
          );
      })
      .on("mousemove", function (event) {
        const containerNode = container.node();
        if (!containerNode) return;
        const [x, y] = d3.pointer(event, containerNode);
        tooltip.style("left", `${x + 18}px`).style("top", `${y + 18}px`);
      })
      .on("mouseleave", function (_event, datum) {
        d3.select(this).style("cursor", isGuessableNode(datum) ? "pointer" : "grab");
        tooltip.style("opacity", "0");
      })
      .on("click", function (event, datum) {
        if (event.defaultPrevented) {
          return;
        }
        if (!onNodeGuessRequest || !isGuessableNode(datum)) {
          return;
        }
        onNodeGuessRequest({
          id: datum.id,
          label: typeof datum.label === "string" && datum.label.trim().length > 0 ? datum.label : datum.id,
          primaryLabel: datum.primaryLabel,
          properties: datum.properties ?? {},
        });
      });

    return () => {
      tooltip.remove();
      simulation.stop();
    };
  }, [model, nodes, links, visualization, guessableNodeLabels, canGuess, onNodeGuessRequest]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="bg-slate-50 rounded-2xl shadow-inner border border-slate-200"
    />
  );
};

export default ForceGraph;
