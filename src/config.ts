import { z } from "zod";

const ConfigSchema = z.object({
  backstageBaseUrl: z
    .string({ error: "BACKSTAGE_BASE_URL is required" })
    .url({ error: "BACKSTAGE_BASE_URL must be a valid URL" })
    .transform((url) => url.replace(/\/$/, "")), // strip trailing slash
  backstageToken: z
    .string({ error: "BACKSTAGE_TOKEN is required" })
    .min(1, { error: "BACKSTAGE_TOKEN must not be empty" }),
  transport: z.enum(["stdio", "http"]).default("stdio"),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  host: z.string().default("127.0.0.1"),
  cacheTtlSeconds: z.coerce.number().int().min(0).default(60),
  requestTimeoutMs: z.coerce.number().int().min(0).default(10_000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const result = ConfigSchema.safeParse({
    backstageBaseUrl: process.env.BACKSTAGE_BASE_URL,
    backstageToken: process.env.BACKSTAGE_TOKEN,
    transport: process.env.MCP_TRANSPORT,
    port: process.env.PORT,
    host: process.env.HOST,
    cacheTtlSeconds: process.env.CACHE_TTL_SECONDS,
    requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS,
  });

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    process.stderr.write(
      `[backstage-mcp] Configuration error:\n${errors}\n\nCopy .env.example to .env and fill in the required values.\n`
    );
    process.exit(1);
  }

  return result.data;
}
