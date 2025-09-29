import "./env.js";
import neo4j from "neo4j-driver";

const {
  NEO4J_URI,
  NEO4J_USER,
  NEO4J_PASSWORD,
} = process.env;

function assertConfig(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

let driver = null;

export function getNeo4jDriver() {
  if (!driver) {
    const uri = assertConfig(NEO4J_URI, "NEO4J_URI");
    const user = assertConfig(NEO4J_USER, "NEO4J_USER");
    const password = assertConfig(NEO4J_PASSWORD, "NEO4J_PASSWORD");
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }
  return driver;
}

export async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

export function ensureDriverConnection() {
  const drv = getNeo4jDriver();
  return drv.verifyConnectivity();
}

export function isNeo4jInteger(value) {
  return neo4j.isInt(value);
}

export function neo4jIntegerToNumber(intValue) {
  if (!neo4j.isInt(intValue)) return intValue;
  const safeNumber = intValue.toNumber();
  return safeNumber;
}
