/**
 * Injected at bundle time by esbuild (`--define`) from package.json's version,
 * so the MCP server reports its real version without hardcoding it. See the
 * `bundle` script in package.json.
 */
declare const __MCP_VERSION__: string;
