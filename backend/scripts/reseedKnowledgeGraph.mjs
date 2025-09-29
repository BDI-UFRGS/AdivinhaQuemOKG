#!/usr/bin/env node
import { closeDriver } from "../src/neo4jClient.js";
import { reseedDataset } from "../src/datasetSeeder.js";
import { resolveKnowledgeGraphDefinition } from "../src/knowledgeGraphRegistry.js";

async function main() {
  const graphName = process.argv[2];
  if (!graphName) {
    console.error("Uso: node backend/scripts/reseedKnowledgeGraph.mjs <nome_do_grafo>");
    process.exitCode = 1;
    return;
  }

  try {
    const definition = await resolveKnowledgeGraphDefinition(graphName);
    console.info(`Recriando dataset materializado para grafo "${definition.name}"...`);
    await reseedDataset(definition);
    console.info("Dataset recarregado com sucesso.");
  } catch (error) {
    console.error("Falha ao recriar dataset materializado:", error);
    process.exitCode = 1;
  } finally {
    await closeDriver();
  }
}

await main();
