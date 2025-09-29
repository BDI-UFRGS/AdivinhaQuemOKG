import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph from "./components/ForceGraph";
import type {
  AppliedFilter,
  BooleanFilterDefinition,
  CategoricalFilterDefinition,
  DatasetFilterMetadata,
  FeatureDetailNode,
  FeatureTreeNode,
  FilterDefinition,
  FilterGroupKey,
  Pessoa,
} from "./types/filters";
import {
  extractFeatureLabel,
  isBooleanFilterDefinition,
  isCategoricalFilterDefinition,
  splitFilterSlug,
} from "./types/filters";
import {
  cloneKnowledgeGraph,
  createEmptyKnowledgeGraph,
  deserializeKnowledgeGraph,
  type KnowledgeGraph,
  type KnowledgeGraphDTO,
} from "./types/knowledgeGraph";
import {
  BASE_VISUALIZATION_CONFIG,
  type GuessableNodeSummary,
  type VisualizationConfig,
  type VisualizationConfigDTO,
} from "./visualization/types";
import {
  buildVisualizationConfig,
  buildVisualizationWithGraphData,
  formatLegendLabel,
} from "./visualization/config";
import { formatValue } from "./utils/value";

const DEFAULT_API_URL =
  typeof window !== "undefined"
    ? `http://${window.location.hostname}:3000`
    : "http://localhost:3000";
const API_URL = import.meta.env.VITE_API_URL ?? DEFAULT_API_URL;

type UsedFilter = { slug: string; option?: string };

type PendingSelection =
  | { kind: "presence"; filter: BooleanFilterDefinition }
  | { kind: "option"; filter: CategoricalFilterDefinition; optionValue: string };

type FilterAvailabilityEntry = {
  slug: string;
  values: string[];
};

type FilterAvailabilityMap = Map<string, Set<string>>;

const normalizeAvailability = (entries?: ReadonlyArray<FilterAvailabilityEntry> | null): FilterAvailabilityMap => {
  const map: FilterAvailabilityMap = new Map();
  if (!entries) {
    return map;
  }
  entries.forEach((entry) => {
    if (!entry || typeof entry.slug !== "string") {
      return;
    }
    const slug = entry.slug.trim();
    if (!slug) {
      return;
    }
    const values = Array.isArray(entry.values) ? entry.values : [];
    const set = new Set<string>();
    values.forEach((value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          set.add(trimmed);
        }
      }
    });
    if (set.size > 0) {
      map.set(slug, set);
    }
  });
  return map;
};

const cloneAvailabilityMap = (source: FilterAvailabilityMap): FilterAvailabilityMap => {
  const clone: FilterAvailabilityMap = new Map();
  source.forEach((values, slug) => {
    clone.set(slug, new Set(values));
  });
  return clone;
};

const isOptionAvailable = (map: FilterAvailabilityMap, slug: string, value: string): boolean => {
  if (!slug || !value) {
    return false;
  }
  const set = map.get(slug);
  if (!set || set.size === 0) {
    return false;
  }
  return set.has(value);
};

type KnowledgeGraphMetadata = {
  name: string;
  title: string;
  description?: string;
  entityLabel?: string;
};

type KnowledgeGraphPayload = KnowledgeGraphMetadata & {
  visualization?: VisualizationConfigDTO | null;
};

type KnowledgeGraphListEntry = KnowledgeGraphMetadata & {
  default?: boolean;
};

type GuessCandidate = {
  id: string;
  label: string;
  primaryLabel?: string | null;
};

type KnowledgeGraphListPayload = {
  graphs?: KnowledgeGraphListEntry[];
  default?: string | null;
};

type DatasetPayload = {
  graph?: KnowledgeGraphPayload;
  pessoas: Pessoa[];
  metadata: DatasetFilterMetadata;
  knowledgeGraph: KnowledgeGraphDTO;
  availableFilters: FilterAvailabilityEntry[];
};

type PerguntaPayload = {
  resposta: "SIM" | "NÃO";
  filtrosAplicados: AppliedFilter[];
  pessoas: Pessoa[];
  knowledgeGraph: KnowledgeGraphDTO;
  availableFilters: FilterAvailabilityEntry[];
  graph?: KnowledgeGraphPayload;
};

const buildGraphInfo = (
  payload: KnowledgeGraphPayload | null | undefined,
  fallbackName: string,
): { metadata: KnowledgeGraphMetadata; visualization: VisualizationConfig } => {
  const fallback = typeof fallbackName === "string" && fallbackName.trim().length > 0 ? fallbackName.trim() : "grafo";
  const name =
    typeof payload?.name === "string" && payload.name.trim().length > 0 ? payload.name.trim() : fallback;
  const title =
    typeof payload?.title === "string" && payload.title.trim().length > 0 ? payload.title.trim() : name;
  const description =
    typeof payload?.description === "string" && payload.description.trim().length > 0
      ? payload.description.trim()
      : undefined;
  const entityLabel =
    typeof payload?.entityLabel === "string" && payload.entityLabel.trim().length > 0
      ? payload.entityLabel.trim()
      : undefined;
  const rawVisualization: VisualizationConfigDTO | null =
    payload && payload.visualization && typeof payload.visualization === "object"
      ? payload.visualization
      : null;
  const visualization = buildVisualizationConfig(
    rawVisualization,
    entityLabel ?? BASE_VISUALIZATION_CONFIG.primaryEntityLabel,
  );
  return {
    metadata: {
      name,
      title,
      description,
      entityLabel,
    },
    visualization,
  };
};

export default function App() {
  const [todas, setTodas] = useState<Pessoa[]>([]);
  const [alvo, setAlvo] = useState<Pessoa | null>(null);
  const [restantes, setRestantes] = useState<Pessoa[]>([]);
  const [usadas, setUsadas] = useState<UsedFilter[]>([]);
  const [resposta, setResposta] = useState<"SIM" | "NÃO" | null>(null);
  const [metadata, setMetadata] = useState<DatasetFilterMetadata | null>(null);
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraph | null>(null);
  const [knowledgeGraphInicial, setKnowledgeGraphInicial] = useState<KnowledgeGraph | null>(null);
  const [graphInstanceKey, setGraphInstanceKey] = useState(0);
  const [baseVisualization, setBaseVisualization] = useState<VisualizationConfig>(() =>
    buildVisualizationConfig(null, BASE_VISUALIZATION_CONFIG.primaryEntityLabel),
  );
  const effectiveVisualization = useMemo(
    () => buildVisualizationWithGraphData(baseVisualization, knowledgeGraph),
    [baseVisualization, knowledgeGraph],
  );
  const [graphMetadata, setGraphMetadata] = useState<KnowledgeGraphMetadata | null>(null);
  const [availableGraphs, setAvailableGraphs] = useState<KnowledgeGraphListEntry[]>([]);
  const [graphListLoading, setGraphListLoading] = useState(true);
  const [graphListError, setGraphListError] = useState<string | null>(null);
  const [selectedGraphName, setSelectedGraphName] = useState<string | null>(null);
  const [disponibilidade, setDisponibilidade] = useState<FilterAvailabilityMap>(() => new Map());
  const [disponibilidadeInicial, setDisponibilidadeInicial] = useState<FilterAvailabilityMap | null>(null);
  const [aplicados, setAplicados] = useState<AppliedFilter[]>([]);
  const [perguntando, setPerguntando] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState<FilterGroupKey | null>(null);
  const [selectedFeatureKey, setSelectedFeatureKey] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);

  const [venceu, setVenceu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const datasetRequestRef = useRef(0);
  const datasetAbortControllerRef = useRef<AbortController | null>(null);
  const perguntaRequestRef = useRef(0);
  const selectedGraphNameRef = useRef<string | null>(null);
  const [scores, setScores] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("scores") || "[]"); } catch { return []; }
  });
  const [guessCandidate, setGuessCandidate] = useState<GuessCandidate | null>(null);

  const salvarScores = (arr: number[]) => { setScores(arr); try { localStorage.setItem("scores", JSON.stringify(arr)); } catch {} };

  async function carregarDataset(
    graphOverride?: string | null,
    options?: { forceReload?: boolean },
  ) {
    const overrideGraph =
      typeof graphOverride === "string" && graphOverride.trim().length > 0
        ? graphOverride.trim()
        : null;
    const forceReloadOption = Boolean(options?.forceReload);
    let shouldForceReload = forceReloadOption;
    const effectiveGraph = overrideGraph
      ? overrideGraph
      : typeof selectedGraphName === "string" && selectedGraphName.trim().length > 0
        ? selectedGraphName.trim()
        : null;
    if (!effectiveGraph) {
      setLoading(false);
      return;
    }
    if (
      !shouldForceReload &&
      overrideGraph &&
      graphMetadata?.name &&
      graphMetadata.name !== overrideGraph
    ) {
      shouldForceReload = true;
    }
    datasetRequestRef.current += 1;
    const requestId = datasetRequestRef.current;
    if (datasetAbortControllerRef.current) {
      datasetAbortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    datasetAbortControllerRef.current = abortController;
    setLoading(true);
    setErro(null);
    perguntaRequestRef.current += 1;
    setPerguntando(false);
    setGraphMetadata(null);
    setAlvo(null);
    setUsadas([]);
    setResposta(null);
    setVenceu(false);
    setKnowledgeGraph(null);
    setKnowledgeGraphInicial(null);
    setGraphInstanceKey((key) => key + 1);
    setDisponibilidade(new Map());
    setDisponibilidadeInicial(null);
    setAplicados([]);
    setSelectedGroupKey(null);
    setSelectedFeatureKey(null);
    setPendingSelection(null);
    setGuessCandidate(null);
    try {
      const params = new URLSearchParams({ graph: effectiveGraph });
      if (shouldForceReload) {
        params.set("reload", "true");
      }
      const response = await fetch(`${API_URL}/dataset?${params.toString()}`, {
        signal: abortController.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as Partial<DatasetPayload>;
      if (!payload || !Array.isArray(payload.pessoas)) {
        throw new Error("Resposta inválida do servidor");
      }
      if (!payload.metadata) {
        throw new Error("Metadados do dataset ausentes");
      }
      if (!payload.knowledgeGraph) {
        throw new Error("Grafo de conhecimento ausente");
      }
      if (!Array.isArray(payload.availableFilters)) {
        throw new Error("Disponibilidade de filtros ausente");
      }
      if (abortController.signal.aborted || datasetRequestRef.current !== requestId) {
        return;
      }
      const graphInfo = buildGraphInfo(payload.graph ?? null, effectiveGraph);
      setGraphMetadata(graphInfo.metadata);
      setBaseVisualization(graphInfo.visualization);
      if (!overrideGraph && graphInfo.metadata.name !== selectedGraphName) {
        setSelectedGraphName(graphInfo.metadata.name);
      }
      const availabilityMap = normalizeAvailability(payload.availableFilters);
      setGraphInstanceKey((key) => key + 1);
      const graph = deserializeKnowledgeGraph(payload.knowledgeGraph);
      setKnowledgeGraph(graph);
      setKnowledgeGraphInicial(graph);
      setMetadata(payload.metadata);
      setDisponibilidade(cloneAvailabilityMap(availabilityMap));
      setDisponibilidadeInicial(cloneAvailabilityMap(availabilityMap));
      const pessoas = payload.pessoas;
      setTodas(pessoas);
      setRestantes(pessoas);
      if (pessoas.length > 0) {
        const escolhida = pessoas[Math.floor(Math.random() * pessoas.length)];
        setAlvo(escolhida);
      } else {
        setAlvo(null);
      }
    } catch (err) {
      if (abortController.signal.aborted || datasetRequestRef.current !== requestId) {
        return;
      }
      console.error("Falha ao carregar dataset", err);
      setErro("Não foi possível carregar o oráculo. Tente novamente.");
    } finally {
      if (datasetRequestRef.current === requestId) {
        setLoading(false);
        if (datasetAbortControllerRef.current === abortController) {
          datasetAbortControllerRef.current = null;
        }
      }
    }
  }

  useEffect(() => {
    selectedGraphNameRef.current = selectedGraphName;
  }, [selectedGraphName]);

  useEffect(() => {
    let cancelado = false;
    async function carregarGrafosDisponiveis() {
      setGraphListLoading(true);
      setGraphListError(null);
      try {
        const response = await fetch(`${API_URL}/knowledge-graphs`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as KnowledgeGraphListPayload;
        const lista = Array.isArray(payload.graphs)
          ? payload.graphs.filter((entry): entry is KnowledgeGraphListEntry =>
              typeof entry?.name === "string" && entry.name.trim().length > 0,
            )
          : [];
        if (cancelado) {
          return;
        }
        setAvailableGraphs(lista);
        const defaultGraphName = (() => {
          if (typeof payload.default === "string" && payload.default.trim().length > 0) {
            return payload.default.trim();
          }
          const explicitDefault = lista.find((entry) => entry.default);
          if (explicitDefault) {
            return explicitDefault.name;
          }
          return lista.length > 0 ? lista[0].name : null;
        })();
        setSelectedGraphName((prev) => {
          if (prev && lista.some((entry) => entry.name === prev)) {
            return prev;
          }
          return defaultGraphName ?? null;
        });
      } catch (err) {
        console.error("Falha ao carregar grafos disponíveis", err);
        if (!cancelado) {
          setGraphListError("Não foi possível carregar os grafos disponíveis.");
          setAvailableGraphs([]);
          setSelectedGraphName(null);
        }
      } finally {
        if (!cancelado) {
          setGraphListLoading(false);
        }
      }
    }
    void carregarGrafosDisponiveis();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedGraphName) {
      setMetadata(null);
      setKnowledgeGraph(null);
      setKnowledgeGraphInicial(null);
      setGraphInstanceKey((key) => key + 1);
      setGraphMetadata(null);
      setTodas([]);
      setRestantes([]);
      setAlvo(null);
      setLoading(false);
      return;
    }
    void carregarDataset(selectedGraphName);
  }, [selectedGraphName]);

  useEffect(() => () => {
    if (datasetAbortControllerRef.current) {
      datasetAbortControllerRef.current.abort();
      datasetAbortControllerRef.current = null;
    }
  }, []);

  const displayGraph: KnowledgeGraph = knowledgeGraph ?? createEmptyKnowledgeGraph();
  const guessableLabels = useMemo(() => {
    const labels = new Set<string>();
    const entityLabel = graphMetadata?.entityLabel;
    if (entityLabel && entityLabel.trim()) {
      labels.add(entityLabel.trim());
    }
    const primary = effectiveVisualization.primaryEntityLabel;
    if (primary && primary.trim()) {
      labels.add(primary.trim());
    }
    return Array.from(labels);
  }, [graphMetadata, effectiveVisualization]);
  const canGuess = Boolean(alvo && !perguntando && !loading && !venceu);
  const handleNodeGuessRequest = useCallback(
    (node: GuessableNodeSummary) => {
      if (!alvo || perguntando || loading) {
        return;
      }
      const label = typeof node.label === "string" && node.label.trim().length > 0 ? node.label : node.id;
      setGuessCandidate({ id: node.id, label, primaryLabel: node.primaryLabel });
    },
    [alvo, perguntando, loading],
  );
  const handleGuessCancel = useCallback(() => {
    setGuessCandidate(null);
  }, []);
  const handleGuessConfirm = () => {
    if (!guessCandidate || !alvo) {
      setGuessCandidate(null);
      return;
    }
    setErro(null);
    setResposta(null);
    setPendingSelection(null);
    setSelectedGroupKey(null);
    setSelectedFeatureKey(null);
    const acertou = guessCandidate.id === alvo.id;
    if (acertou) {
      setRestantes([alvo]);
      registrarSeVenceu([alvo], usadas.length);
    } else {
      novoAlvo();
    }
    setGuessCandidate(null);
  };

  const filtrosPorSlug = useMemo(() => {
    if (!metadata) return new Map<string, FilterDefinition>();
    return new Map(metadata.filters.map((f) => [f.slug, f] as const));
  }, [metadata]);

  const featuresByGroup = useMemo(() => {
    const grouped = new Map<FilterGroupKey, FeatureTreeNode[]>();
    if (!metadata) return grouped;

    const featureLookup = new Map<string, FeatureTreeNode>();

    metadata.filters.forEach((filter) => {
      const { featureSlug: parsedFeatureSlug, detailType } = splitFilterSlug(filter.slug);
      const featureSlug = filter.featureSlug ?? parsedFeatureSlug ?? filter.slug;
      const featureKey = `${filter.group}::${featureSlug}`;

      let entry = featureLookup.get(featureKey);
      if (!entry) {
        entry = {
          key: featureKey,
          slug: featureSlug,
          label: extractFeatureLabel(filter),
          group: filter.group,
          featureRelation: filter.featureRelation ?? undefined,
          booleanFilter: undefined,
          detailFilters: [],
        };
        featureLookup.set(featureKey, entry);
        const list = grouped.get(filter.group) ?? [];
        list.push(entry);
        grouped.set(filter.group, list);
      } else {
        if (!entry.featureRelation && filter.featureRelation) {
          entry.featureRelation = filter.featureRelation;
        }
        if (filter.featureName && filter.featureName.trim()) {
          entry.label = filter.featureName.trim();
        }
      }

      if (filter.variant === "boolean") {
        entry.booleanFilter = filter;
        if (filter.featureName && filter.featureName.trim()) {
          entry.label = filter.featureName.trim();
        }
        if (filter.featureRelation) {
          entry.featureRelation = filter.featureRelation;
        }
        return;
      }

      const detailKey = detailType ?? filter.slug;
      const detailLabel =
        filter.detailLabel && filter.detailLabel.trim()
          ? filter.detailLabel.trim()
          : detailType
          ? detailType.replace(/_/g, " ")
          : filter.label;
      entry.detailFilters.push({
        key: detailKey,
        label: detailLabel,
        relation: filter.detailRelation ?? detailType ?? null,
        detailType,
        filter,
      });
      if (filter.featureName && filter.featureName.trim()) {
        entry.label = filter.featureName.trim();
      }
    });

    return grouped;
  }, [metadata]);

  const gruposOrdenados = metadata?.groups ?? [];

  useEffect(() => {
    if (!metadata || !Array.isArray(metadata.groups) || metadata.groups.length === 0) {
      setSelectedGroupKey(null);
      setSelectedFeatureKey(null);
      setPendingSelection(null);
      return;
    }
    const currentGroupExists = metadata.groups.some((group) => group.key === selectedGroupKey);
    if (!currentGroupExists) {
      setSelectedGroupKey(metadata.groups[0].key);
      setSelectedFeatureKey(null);
      setPendingSelection(null);
    }
  }, [metadata, selectedGroupKey]);

  useEffect(() => {
    if (!selectedGroupKey) {
      setSelectedFeatureKey(null);
      setPendingSelection(null);
      return;
    }
    const features = featuresByGroup.get(selectedGroupKey) ?? [];
    if (!features.some((feature) => feature.key === selectedFeatureKey)) {
      setSelectedFeatureKey(null);
      setPendingSelection(null);
    }
  }, [selectedGroupKey, selectedFeatureKey, featuresByGroup]);

  useEffect(() => {
    if (!pendingSelection) {
      return;
    }
    if (pendingSelection.kind === "presence") {
      const slug = pendingSelection.filter.slug;
      if (usadas.some((entry) => entry.slug === slug)) {
        setPendingSelection(null);
      }
      return;
    }
    const slug = pendingSelection.filter.slug;
    const optionValue = pendingSelection.optionValue;
    if (usadas.some((entry) => entry.slug === slug && entry.option === optionValue)) {
      setPendingSelection(null);
    }
  }, [pendingSelection, usadas]);

  function registrarSeVenceu(nextRest: Pessoa[], filtrosAntes: number) {
    if (!venceu && nextRest.length === 1) {
      const moves = filtrosAntes + 1;
      const novo = [...scores, moves].sort((a, b) => a - b).slice(0, 5);
      salvarScores(novo);
      setVenceu(true);
    }
  }

  async function consultarPergunta(
    slug: string,
    valor: string,
    graphName: string,
  ): Promise<PerguntaPayload> {
    if (!alvo) {
      throw new Error("Alvo não definido");
    }
    const response = await fetch(`${API_URL}/pergunta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        alvoId: alvo.id,
        filtro: { slug, valor },
        filtrosAplicados: aplicados,
        graph: graphName,
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as Partial<PerguntaPayload>;
    if (!payload || !Array.isArray(payload.pessoas) || !payload.knowledgeGraph || !payload.filtrosAplicados) {
      throw new Error("Resposta inválida do servidor");
    }
    if (payload.resposta !== "SIM" && payload.resposta !== "NÃO") {
      throw new Error("Resposta inválida do oráculo");
    }
    if (!Array.isArray(payload.availableFilters)) {
      throw new Error("Disponibilidade de filtros ausente");
    }
    return payload as PerguntaPayload;
  }

  async function perguntarBoolean(filtro: BooleanFilterDefinition) {
    const slug = filtro.slug;
    if (perguntando) return;
    if (usadas.some((u) => u.slug === slug)) return;
    if (!alvo) return;
    const valor = filtro.positiveValue ?? slug;
    const graphName = selectedGraphNameRef.current ?? graphMetadata?.name ?? null;
    if (!graphName) {
      setErro("Grafo não selecionado");
      return;
    }
    const requestId = perguntaRequestRef.current + 1;
    perguntaRequestRef.current = requestId;
    setPerguntando(true);
    setErro(null);
    try {
      const payload = await consultarPergunta(slug, valor, graphName);
      if (perguntaRequestRef.current !== requestId) {
        return;
      }
      if (selectedGraphNameRef.current && selectedGraphNameRef.current !== graphName) {
        return;
      }
      if (payload.graph) {
        const graphInfo = buildGraphInfo(payload.graph, graphName);
        setGraphMetadata(graphInfo.metadata);
        setBaseVisualization(graphInfo.visualization);
        if (graphInfo.metadata.name !== graphName) {
          setSelectedGraphName((prev) =>
            prev === graphInfo.metadata.name ? prev : graphInfo.metadata.name,
          );
        }
        setGraphInstanceKey((key) => key + 1);
      }
      const graph = deserializeKnowledgeGraph(payload.knowledgeGraph);
      setKnowledgeGraph(graph);
      const availabilityMap = normalizeAvailability(payload.availableFilters);
      setDisponibilidade(cloneAvailabilityMap(availabilityMap));
      setAplicados(payload.filtrosAplicados);
      setResposta(payload.resposta);
      setRestantes(payload.pessoas);
      setUsadas((u) => [...u, { slug }]);
      registrarSeVenceu(payload.pessoas, usadas.length);
    } catch (err) {
      console.error("Falha ao consultar o oráculo", err);
      setErro("Não foi possível consultar o oráculo. Tente novamente.");
    } finally {
      if (perguntaRequestRef.current === requestId) {
        setPerguntando(false);
      }
    }
  }

  async function perguntarOpcao(filtro: CategoricalFilterDefinition, valor: string) {
    const slug = filtro.slug;
    if (perguntando) return;
    if (usadas.some((u) => u.slug === slug && u.option === valor)) return;
    if (!alvo) return;
    const graphName = selectedGraphNameRef.current ?? graphMetadata?.name ?? null;
    if (!graphName) {
      setErro("Grafo não selecionado");
      return;
    }
    const requestId = perguntaRequestRef.current + 1;
    perguntaRequestRef.current = requestId;
    setPerguntando(true);
    setErro(null);
    try {
      const payload = await consultarPergunta(slug, valor, graphName);
      if (perguntaRequestRef.current !== requestId) {
        return;
      }
      if (selectedGraphNameRef.current && selectedGraphNameRef.current !== graphName) {
        return;
      }
      if (payload.graph) {
        const graphInfo = buildGraphInfo(payload.graph, graphName);
        setGraphMetadata(graphInfo.metadata);
        setBaseVisualization(graphInfo.visualization);
        if (graphInfo.metadata.name !== graphName) {
          setSelectedGraphName((prev) =>
            prev === graphInfo.metadata.name ? prev : graphInfo.metadata.name,
          );
        }
        setGraphInstanceKey((key) => key + 1);
      }
      const graph = deserializeKnowledgeGraph(payload.knowledgeGraph);
      setKnowledgeGraph(graph);
      const availabilityMap = normalizeAvailability(payload.availableFilters);
      setDisponibilidade(cloneAvailabilityMap(availabilityMap));
      setAplicados(payload.filtrosAplicados);
      setResposta(payload.resposta);
      setRestantes(payload.pessoas);
      setUsadas((u) => [...u, { slug, option: valor }]);
      registrarSeVenceu(payload.pessoas, usadas.length);
    } catch (err) {
      console.error("Falha ao consultar o oráculo", err);
      setErro("Não foi possível consultar o oráculo. Tente novamente.");
    } finally {
      if (perguntaRequestRef.current === requestId) {
        setPerguntando(false);
      }
    }
  }

  function novoAlvo() {
    if (selectedGraphName) {
      void carregarDataset(selectedGraphName);
    }
  }

  const usado = (slug: string, option?: string) =>
    usadas.some((u) => u.slug === slug && (option ? u.option === option : true));

  const obterRotuloFiltro = (slug: string) => filtrosPorSlug.get(slug)?.label ?? slug;

  const obterRotuloOpcao = (slug: string, option?: string) => {
    if (!option) return undefined;
    const filtro = filtrosPorSlug.get(slug);
    if (filtro && isCategoricalFilterDefinition(filtro)) {
      return filtro.options.find((opt) => opt.value === option)?.label ?? option;
    }
    return option;
  };

  const nomePessoa = (pessoa: Pessoa): string => {
    if (typeof pessoa.nome === "string" && pessoa.nome.trim()) return pessoa.nome;
    if (typeof pessoa.label === "string" && pessoa.label.trim()) return pessoa.label;
    const propsNome = pessoa.properties?.nome;
    if (typeof propsNome === "string" && propsNome.trim()) return propsNome;
    return pessoa.id;
  };

  const orderedGroups = gruposOrdenados;
  const selectedGroup = orderedGroups.find((group) => group.key === selectedGroupKey) ?? null;
  const featuresForSelectedGroup = selectedGroupKey ? featuresByGroup.get(selectedGroupKey) ?? [] : [];
  const featuresGroupedByRelation = featuresForSelectedGroup.reduce(
    (acc, feature) => {
      const relation = feature.featureRelation
        ? feature.featureRelation.toUpperCase()
        : "RELACIONA";
      if (!acc.has(relation)) {
        acc.set(relation, [] as FeatureTreeNode[]);
      }
      acc.get(relation)!.push(feature);
      return acc;
    },
    new Map<string, FeatureTreeNode[]>(),
  );
  const relationBuckets = Array.from(featuresGroupedByRelation.entries());
  const selectedFeature = featuresForSelectedGroup.find((feature) => feature.key === selectedFeatureKey) ?? null;
  const detailSections = selectedFeature ? selectedFeature.detailFilters : [];

  const pendingDescription = useMemo(() => {
    if (!pendingSelection) {
      return null;
    }
    if (pendingSelection.kind === "presence") {
      const filter = pendingSelection.filter;
      const relation = filter.featureRelation ? filter.featureRelation.toUpperCase() : null;
      const label = filter.featureName && filter.featureName.trim() ? filter.featureName.trim() : filter.label;
      return relation ? `${relation} ${label}` : label;
    }
    const { filter, optionValue } = pendingSelection;
    const optionLabel = filter.options.find((opt) => opt.value === optionValue)?.label ?? optionValue;
    const featureLabel = filter.featureName && filter.featureName.trim() ? filter.featureName.trim() : filter.label;
    const detailLabel = filter.detailLabel && filter.detailLabel.trim()
      ? filter.detailLabel.trim()
      : filter.detailType
      ? filter.detailType.replace(/_/g, " ")
      : filter.label;
    const relation = filter.detailRelation ? filter.detailRelation.toUpperCase() : null;
    const detailPrefix = relation ? `${relation}: ${detailLabel}` : detailLabel;
    return `${featureLabel} • ${detailPrefix} → ${optionLabel}`;
  }, [pendingSelection]);

  const canApplyPending = useMemo(() => {
    if (!pendingSelection || !alvo || perguntando) {
      return false;
    }
    if (pendingSelection.kind === "presence") {
      const slug = pendingSelection.filter.slug;
      if (!slug) {
        return false;
      }
      if (usadas.some((entry) => entry.slug === slug)) {
        return false;
      }
      const value = pendingSelection.filter.positiveValue ?? slug;
      return typeof value === "string" && value.trim().length > 0;
    }
    const { filter, optionValue } = pendingSelection;
    if (!optionValue) {
      return false;
    }
    if (usadas.some((entry) => entry.slug === filter.slug && entry.option === optionValue)) {
      return false;
    }
    return true;
  }, [pendingSelection, alvo, perguntando, usadas]);

  const handleSelectGroup = (key: FilterGroupKey) => {
    setSelectedGroupKey((prev) => (prev === key ? null : key));
    setSelectedFeatureKey(null);
    setPendingSelection(null);
  };

  const handleSelectFeature = (featureKey: string) => {
    setSelectedFeatureKey((prev) => (prev === featureKey ? null : featureKey));
    setPendingSelection(null);
  };

  const handleSelectPresence = (filter: BooleanFilterDefinition) => {
    if (perguntando || !alvo) {
      return;
    }
    const slug = filter.slug;
    if (!slug || usadas.some((entry) => entry.slug === slug)) {
      setPendingSelection(null);
      return;
    }
    const positiveValue =
      typeof filter.positiveValue === "string"
        ? filter.positiveValue.trim() || slug
        : typeof filter.slug === "string"
        ? filter.slug.trim()
        : slug;
    const availabilitySet = disponibilidade.get(filter.slug);
    const presenceAvailable =
      positiveValue && positiveValue.trim().length > 0
        ? !availabilitySet || availabilitySet.size === 0
          ? true
          : isOptionAvailable(disponibilidade, filter.slug, positiveValue)
        : false;
    if (!presenceAvailable) {
      return;
    }
    if (pendingSelection?.kind === "presence" && pendingSelection.filter.slug === slug) {
      setPendingSelection(null);
      return;
    }
    setPendingSelection({ kind: "presence", filter });
  };

  const handleSelectOption = (filter: CategoricalFilterDefinition, optionValue: string) => {
    if (perguntando || !alvo) {
      return;
    }
    if (!optionValue) {
      return;
    }
    const available = isOptionAvailable(disponibilidade, filter.slug, optionValue);
    if (!available) {
      return;
    }
    if (usadas.some((entry) => entry.slug === filter.slug && entry.option === optionValue)) {
      setPendingSelection(null);
      return;
    }
    const isSameOption =
      pendingSelection?.kind === "option" &&
      pendingSelection.filter.slug === filter.slug &&
      pendingSelection.optionValue === optionValue;
    if (isSameOption) {
      setPendingSelection(null);
      return;
    }
    setPendingSelection({ kind: "option", filter, optionValue });
  };

  const handleApplyPending = async () => {
    if (!pendingSelection || !canApplyPending) {
      return;
    }
    try {
      if (pendingSelection.kind === "presence") {
        await perguntarBoolean(pendingSelection.filter);
      } else {
        await perguntarOpcao(pendingSelection.filter, pendingSelection.optionValue);
      }
    } finally {
      setPendingSelection(null);
    }
  };


  const best = scores.length ? scores[0] : null;
  const vitoria = restantes.length === 1 ? (
    <div className="p-3 rounded-xl bg-emerald-600 text-white text-sm mt-2 flex items-center justify-between">
      <span>
        🎉 Você acertou! A pessoa era <strong>{nomePessoa(restantes[0])}</strong>.
        {best !== null && <em className="ml-2 opacity-90">Recorde: {best} filtro(s)</em>}
      </span>
      <button onClick={novoAlvo} className="ml-2 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30">Jogar novamente</button>
    </div>
  ) : null;

  return (
    <div className="min-h-screen w-full bg-white text-slate-800 p-6">
      {guessCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Confirmar chute</h2>
            <p className="mt-2 text-sm text-slate-600">
              Você deseja chutar
              {" "}
              <span className="font-semibold text-slate-900">
                {guessCandidate.label}
              </span>
              {guessCandidate.primaryLabel && guessCandidate.primaryLabel.trim().length > 0 ? (
                <span className="text-slate-500">
                  {` (${formatLegendLabel(guessCandidate.primaryLabel.trim())})`}
                </span>
              ) : null}
              ?
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Se acertar, você vence a rodada. Caso erre, um novo alvo será escolhido automaticamente.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleGuessCancel}
                className="px-3 py-1.5 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuessConfirm}
                className="px-3 py-1.5 text-sm rounded-xl bg-fuchsia-600 text-white hover:bg-fuchsia-700"
              >
                Chutar
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto grid grid-cols-12 gap-6">
        <div className="col-span-12">
          <div className="bg-white rounded-2xl p-4 shadow border border-slate-200 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-wide text-slate-500">Grafo selecionado</p>
              <h1 className="text-xl font-semibold text-slate-900">
                {graphMetadata?.title ?? "Selecione um grafo para começar"}
              </h1>
              {graphMetadata?.description && (
                <p className="text-sm text-slate-600 mt-1 max-w-3xl">{graphMetadata.description}</p>
              )}
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              {graphListError && <div className="text-xs text-rose-600">{graphListError}</div>}
              <div className="flex flex-wrap items-center gap-2">
                {graphListLoading ? (
                  <span className="text-xs text-slate-500">Carregando grafos…</span>
                ) : availableGraphs.length > 0 ? (
                  <select
                    value={selectedGraphName ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedGraphName(value ? value : null);
                    }}
                    className="px-3 py-1.5 text-sm rounded-xl border border-slate-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    {availableGraphs.map((graph) => (
                      <option key={graph.name} value={graph.name}>
                        {graph.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-rose-600">Nenhum grafo disponível.</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedGraphName) {
                      void carregarDataset(selectedGraphName, { forceReload: true });
                    }
                  }}
                  disabled={!selectedGraphName || loading}
                  className="px-3 py-1.5 text-sm rounded-xl bg-slate-800 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Recarregar
                </button>
              </div>
            </div>
          </div>
        </div>
        <aside className="col-span-4 space-y-3">
          <div className="bg-slate-100 rounded-2xl p-4 shadow">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">Filtros</h2>
              <div className="flex gap-2">
                <button onClick={novoAlvo} className="text-sm px-3 py-1 rounded-xl bg-fuchsia-600 text-white hover:opacity-90">Novo alvo</button>
                <button
                  onClick={() => {
                    setRestantes(todas);
                    setUsadas([]);
                    setAplicados([]);
                    setResposta(null);
                    setVenceu(false);
                    setErro(null);
                    if (knowledgeGraphInicial) {
                      setKnowledgeGraph(cloneKnowledgeGraph(knowledgeGraphInicial));
                    } else {
                      setKnowledgeGraph(null);
                    }
                    if (disponibilidadeInicial) {
                      setDisponibilidade(cloneAvailabilityMap(disponibilidadeInicial));
                    } else {
                      setDisponibilidade(new Map());
                    }
                    setSelectedGroupKey(null);
                    setSelectedFeatureKey(null);
                    setPendingSelection(null);
                  }}
                  className="text-sm px-3 py-1 rounded-xl bg-slate-800 text-white hover:opacity-90"
                >
                  Resetar
                </button>
              </div>
            </div>
            <div className="mb-2 text-sm text-slate-600">Restantes: <span className="font-semibold text-slate-900">{restantes.length}</span> / {todas.length}</div>
            <div className="mb-2 text-sm space-y-1">
              {loading && (
                <span className="text-xs text-slate-500">Carregando oráculo…</span>
              )}
              {resposta && (
                <span className={`px-2 py-1 rounded-xl ${resposta === 'SIM' ? 'bg-emerald-600' : 'bg-rose-600'} text-white`}>Resposta do oráculo: {resposta}</span>
              )}
            </div>
            {erro && (
              <div className="mb-2 text-xs text-rose-600">{erro}</div>
            )}
            {vitoria}

            <div className="mt-2 mb-3 flex flex-wrap gap-2">
              {usadas.length === 0 ? (
                <span className="text-xs text-slate-500">Nenhum filtro aplicado.</span>
              ) : (
                usadas.map((f) => {
                  const label = obterRotuloFiltro(f.slug);
                  const optionLabel = obterRotuloOpcao(f.slug, f.option);
                  const key = `${f.slug}:${f.option ?? ""}`;
                  return (
                    <span
                      key={key}
                      className="px-2 py-1 text-xs rounded-full bg-slate-800 text-white"
                    >
                      {label}
                      {optionLabel ? `: ${optionLabel}` : ""}
                    </span>
                  );
                })
              )}
            </div>

            <div className="bg-white rounded-xl p-2 border border-slate-200 mb-3">
              <div className="text-xs font-semibold mb-1">🏆 Ranking (menos filtros)</div>
              {scores.length ? (
                <ol className="text-xs list-decimal list-inside text-slate-700">
                  {scores.map((s, i)=> <li key={i}>{s} filtro(s)</li>)}
                </ol>
              ) : (
                <div className="text-xs text-slate-500">Jogue para registrar seu recorde.</div>
              )}
            </div>

            <div className="space-y-3 h-[52vh] overflow-auto pr-1">
              <div className="bg-white rounded-2xl p-3 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filtros:</span>
                  {orderedGroups.length > 0 ? (
                    orderedGroups.map((grupo) => {
                      const ativo = grupo.key === selectedGroupKey;
                      return (
                        <button
                          key={grupo.key}
                          type="button"
                          onClick={() => handleSelectGroup(grupo.key)}
                          className={`px-3 py-1.5 rounded-xl border text-xs transition ${
                            ativo
                              ? "bg-slate-800 text-white border-slate-800"
                              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                          }`}
                        >
                          {grupo.label}
                        </button>
                      );
                    })
                  ) : (
                  <span className="text-xs text-slate-500">Carregando filtros…</span>
                  )}
                </div>

              </div>

              <div className="bg-white rounded-2xl p-3 shadow-sm">
                {selectedGroup ? (
                  relationBuckets.length > 0 ? (
                    relationBuckets.map(([relation, lista]) => (
                      <div key={relation} className="mb-3 last:mb-0">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">
                          {`${formatLegendLabel(relation)}:`}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {lista.map((feature) => {
                            const ativo = selectedFeatureKey === feature.key;
                            const disabled = perguntando || !alvo || usado(feature.slug);
                            return (
                              <button
                                key={feature.key}
                                type="button"
                                disabled={disabled}
                                onClick={() => handleSelectFeature(feature.key)}
                                className={`px-3 py-1.5 rounded-xl border text-xs transition ${
                                  disabled
                                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                    : ativo
                                    ? "bg-slate-800 text-white border-slate-800"
                                    : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-200"
                                }`}
                              >
                                {feature.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500">Nenhuma característica disponível.</div>
                  )
                ) : (
                  <div className="text-xs text-slate-500">Selecione um filtro de nível 1 para começar.</div>
                )}
              </div>

              <div className="bg-white rounded-2xl p-3 shadow-sm">
                {selectedFeature ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{selectedFeature.label}</div>
                        {selectedFeature.featureRelation && (
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            {formatLegendLabel(selectedFeature.featureRelation)}
                          </div>
                        )}
                      </div>
                      {selectedFeature.booleanFilter && (
                        (() => {
                          const booleanFilter = selectedFeature.booleanFilter;
                          const slug = booleanFilter.slug;
                          const positiveValue =
                            typeof booleanFilter.positiveValue === "string"
                              ? booleanFilter.positiveValue.trim() || slug
                              : typeof booleanFilter.slug === "string"
                              ? booleanFilter.slug.trim()
                              : slug;
                          const availabilitySet = disponibilidade.get(booleanFilter.slug);
                          const presenceAvailable =
                            positiveValue && positiveValue.length > 0
                              ? !availabilitySet || availabilitySet.size === 0
                                ? true
                                : isOptionAvailable(disponibilidade, booleanFilter.slug, positiveValue)
                              : false;
                          const presenceDisabled =
                            !presenceAvailable || perguntando || !alvo || usadas.some((entry) => entry.slug === slug);
                          const presenceActive =
                            pendingSelection?.kind === "presence" && pendingSelection.filter.slug === slug;
                          const presenceLabel = booleanFilter.featureName && booleanFilter.featureName.trim()
                            ? booleanFilter.featureName.trim()
                            : selectedFeature.label;
                          const relationLabel = booleanFilter.featureRelation
                            ? booleanFilter.featureRelation.toUpperCase()
                            : "";
                          const buttonLabel = relationLabel
                            ? `${relationLabel} ${presenceLabel}`
                            : presenceLabel;
                          return (
                            <button
                              type="button"
                              onClick={() => handleSelectPresence(booleanFilter)}
                              disabled={presenceDisabled}
                              className={`px-3 py-1.5 rounded-xl border text-xs transition ${
                                presenceDisabled
                                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                  : presenceActive
                                  ? "bg-slate-800 text-white border-slate-800"
                                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                              }`}
                              title={presenceDisabled ? "Filtro indisponível" : "Selecionar presença"}
                            >
                              {presenceActive ? `Selecionado: ${buttonLabel}` : buttonLabel}
                            </button>
                          );
                        })()
                      )}
                    </div>
                    <div className="mt-3 space-y-3">
                      {detailSections.length > 0 ? (
                        detailSections.map((detail) => {
                          const relationLabel = detail.relation ? detail.relation.toUpperCase() : null;
                          const detailActive =
                            pendingSelection?.kind === "option" &&
                            pendingSelection.filter.slug === detail.filter.slug;
                          return (
                            <div
                              key={detail.key}
                              className={`rounded-xl border p-3 ${
                                detailActive ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white"
                              }`}
                            >
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                                <span className="font-semibold text-slate-700">{detail.label}</span>
                                {relationLabel && (
                                  <span className="uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                    {relationLabel}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {detail.filter.options.length ? (
                                  detail.filter.options.map((opcao) => {
                                    const optionAvailable = isOptionAvailable(
                                      disponibilidade,
                                      detail.filter.slug,
                                      opcao.value,
                                    );
                                    const optionUsed = usadas.some(
                                      (entry) => entry.slug === detail.filter.slug && entry.option === opcao.value,
                                    );
                                    const disabled =
                                      perguntando ||
                                      !alvo ||
                                      optionUsed ||
                                      !optionAvailable;
                                    const ativo =
                                      pendingSelection?.kind === "option" &&
                                      pendingSelection.filter.slug === detail.filter.slug &&
                                      pendingSelection.optionValue === opcao.value;
                                    return (
                                      <button
                                        key={opcao.value}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => handleSelectOption(detail.filter, opcao.value)}
                                        className={`px-2.5 py-1 rounded-xl border text-xs transition ${
                                          disabled
                                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                                            : ativo
                                            ? "bg-slate-800 text-white border-slate-800"
                                            : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-200"
                                        }`}
                                        title={disabled ? "Filtro indisponível" : "Selecionar valor"}
                                      >
                                        {opcao.label}
                                      </button>
                                    );
                                  })
                                ) : (
                                  <span className="text-xs text-slate-500">Sem opções disponíveis.</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-slate-500">
                          Sem filtros específicos para esta característica.
                        </div>
                      )}
                    </div>
                  </>
                ) : selectedGroup ? (
                  <div className="text-xs text-slate-500">Escolha uma característica para explorar.</div>
                ) : (
                  <div className="text-xs text-slate-500">Selecione um filtro de nível 1 para começar.</div>
                )}

                <div className="mt-3 flex flex-col gap-2">
                  {pendingDescription ? (
                    <div className="text-[11px] text-slate-600">
                      Filtro selecionado: <span className="font-semibold text-slate-800">{pendingDescription}</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500">Selecione um filtro para aplicar.</div>
                  )}
                  <button
                    type="button"
                    onClick={handleApplyPending}
                    disabled={!canApplyPending}
                    className={`self-end px-3 py-1.5 rounded-xl text-sm border transition ${
                      canApplyPending
                        ? "bg-slate-800 text-white border-slate-800 hover:bg-slate-700"
                        : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    }`}
                  >
                    Aplicar filtro
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="col-span-8">
          <div className="bg-white rounded-2xl p-4 shadow border border-slate-200">
            <div className="mb-3"><h2 className="text-xl font-semibold">Grafo de Conhecimento</h2></div>
            <ForceGraph
              key={graphInstanceKey}
              nodes={displayGraph.nodes}
              links={displayGraph.links}
              model={displayGraph.model}
              visualization={effectiveVisualization}
              guessableNodeLabels={guessableLabels}
              canGuess={canGuess}
              onNodeGuessRequest={handleNodeGuessRequest}
            />
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {restantes.map((p) => {
                const atributos = Object.entries(p.properties ?? {})
                  .filter(([key]) => !["id", "nome", "label", "slug"].includes(key))
                  .slice(0, 8);
                return (
                  <div key={p.id} className="p-3 rounded-2xl border border-slate-200 shadow-sm bg-slate-50">
                    <div className="text-sm font-semibold">{nomePessoa(p)}</div>
                    <div className="text-[11px] text-slate-600">ID: {p.id}</div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-700">
                      {atributos.length ? (
                        atributos.map(([key, value]) => (
                          <span key={key} className="px-2 py-[2px] rounded-full bg-white border">
                            {key}: {formatValue(value)}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-500">Sem detalhes adicionais.</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
