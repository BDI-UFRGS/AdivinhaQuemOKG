import "./env.js";
import { createServer } from "http";
import { URL } from "url";
import { loadDataset, applyQuestion } from "./datasetService.js";
import { ensureDriverConnection } from "./neo4jClient.js";
import { ensureDatasetSeeded } from "./datasetSeeder.js";
import { listKnowledgeGraphs, getDefaultKnowledgeGraphDefinition } from "./knowledgeGraphRegistry.js";

const DEFAULT_CONNECT_ATTEMPTS = 30;
const DEFAULT_CONNECT_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForNeo4jConnectivity() {
  const maxAttempts = Number(process.env.NEO4J_CONNECT_RETRIES ?? DEFAULT_CONNECT_ATTEMPTS);
  const delayMs = Number(process.env.NEO4J_CONNECT_DELAY_MS ?? DEFAULT_CONNECT_DELAY_MS);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await ensureDriverConnection();
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      console.warn(
        `Neo4j indisponível (tentativa ${attempt}/${maxAttempts}): ${error.message}. Repetindo em ${delayMs}ms...`,
      );
      await sleep(delayMs);
    }
  }
}

function handleCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("JSON inválido");
  }
}

function validateString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

async function bootstrap() {
  try {
    await waitForNeo4jConnectivity();
    const defaultGraph = await getDefaultKnowledgeGraphDefinition();
    await ensureDatasetSeeded(defaultGraph);
  } catch (error) {
    console.error("Falha ao preparar conexão com Neo4j", error);
    process.exit(1);
  }

  const server = createServer(async (req, res) => {
    if (!req.url || !req.headers.host) {
      sendJson(res, 400, { error: "Requisição inválida" });
      return;
    }

    if (handleCors(req, res)) {
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      try {
        await ensureDriverConnection();
        sendJson(res, 200, { status: "ok" });
      } catch (error) {
        console.error("Falha ao verificar conexão com Neo4j", error);
        sendJson(res, 500, { status: "erro", detail: "Neo4j indisponível" });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/knowledge-graphs") {
      try {
        const graphs = await listKnowledgeGraphs();
        const defaultGraph = graphs.find((graph) => graph.default) ?? graphs[0] ?? null;
        sendJson(res, 200, {
          graphs,
          default: defaultGraph ? defaultGraph.name : null,
        });
      } catch (error) {
        console.error("Erro ao listar grafos disponíveis", error);
        sendJson(res, 500, { error: "Falha ao listar grafos" });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/dataset") {
      try {
        const graphName = url.searchParams.get("graph");
        const reloadParam = url.searchParams.get("reload");
        const shouldReload =
          typeof reloadParam === "string" &&
          ["1", "true", "yes", "sim", "on"].includes(reloadParam.toLowerCase());
        const dataset = await loadDataset(graphName, { forceReload: shouldReload });
        sendJson(res, 200, dataset);
      } catch (error) {
        console.error("Erro ao carregar dataset", error);
        if (error?.code === "GRAPH_NOT_FOUND") {
          sendJson(res, 404, { error: "Grafo não encontrado" });
        } else {
          sendJson(res, 500, { error: "Falha ao carregar dataset" });
        }
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/pergunta") {
      try {
        const body = await readJsonBody(req);
        const alvoId = validateString(body?.alvoId);
        const slug = validateString(body?.filtro?.slug ?? body?.slug);
        const value = validateString(body?.filtro?.valor ?? body?.valor);
        const appliedFilters = Array.isArray(body?.filtrosAplicados) ? body.filtrosAplicados : [];

        if (!alvoId || !slug || !value) {
          sendJson(res, 400, { error: "Parâmetros inválidos" });
          return;
        }

        const graphName = validateString(body?.grafo) ?? validateString(body?.graph);

        const resultado = await applyQuestion({
          alvoId,
          slug,
          value,
          appliedFilters,
          graphName,
        });

        sendJson(res, 200, resultado);
      } catch (error) {
        console.error("Erro ao processar pergunta", error);
        if (error?.code === "GRAPH_NOT_FOUND") {
          sendJson(res, 404, { error: "Grafo não encontrado" });
        } else {
          sendJson(res, 500, { error: "Falha ao consultar Neo4j" });
        }
      }
      return;
    }

    sendJson(res, 404, { error: "Não encontrado" });
  });

  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`HTTP server escutando na porta ${port}`);
  });
}

bootstrap();
