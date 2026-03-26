import { createServer } from "./server.js";
import { loadConfig } from "./config.js";

// Load .env file if present (no external dep)
await loadDotEnv();

const config = loadConfig();
const server = createServer(config);

if (config.transport === "stdio") {
  await server.serveStdio();
  process.stderr.write(
    `[backstage-mcp] Connected to Backstage at ${config.backstageBaseUrl}\n`
  );
} else {
  await server.serveHttp(config.host, config.port);
}

async function loadDotEnv(): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const text = await fs.readFile(".env", "utf-8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (key && !(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not present — rely on environment variables
  }
}
