/**
 * Code generator for OpenAPI -> MCP runtimes.
 *
 * Supported runtime modes:
 * - standalone_no_auth
 * - standalone_headers
 * - emcy_hosted_worker
 */

import type {
  GeneratorOptions,
  GeneratedFiles,
  McpToolDefinition,
  PromptDefinition,
  RuntimeMode,
  SecurityScheme,
  UpstreamHeaderConfig,
} from "./types.js";

function getRuntimeMode(options: GeneratorOptions): RuntimeMode {
  if (options.runtimeMode) {
    return options.runtimeMode;
  }

  if (options.hostedWorkerConfig) {
    return "emcy_hosted_worker";
  }

  if ((options.upstreamHeaders?.length ?? 0) > 0) {
    return "standalone_headers";
  }

  return "standalone_no_auth";
}

function isHostedWorkerMode(options: GeneratorOptions): boolean {
  return getRuntimeMode(options) === "emcy_hosted_worker";
}

function toEnvKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

function formatHeaderDescription(headers: UpstreamHeaderConfig[]): string {
  if (headers.length === 0) {
    return "none";
  }

  return headers
    .map((header) =>
      header.valuePrefix
        ? `${header.name} (${header.valuePrefix} <${header.envVar}>)`
        : `${header.name} (<${header.envVar}>)`
    )
    .join(", ");
}

/**
 * Generate a complete MCP server from tool definitions.
 */
export function generateMcpServer(
  tools: McpToolDefinition[],
  options: GeneratorOptions,
  securitySchemes: Record<string, SecurityScheme> = {}
): GeneratedFiles {
  const files: GeneratedFiles = {};

  files["package.json"] = generatePackageJson(options);
  files["tsconfig.json"] = generateTsConfig();
  files["src/index.ts"] = generateServerEntry(tools, options, securitySchemes);
  files["src/transport.ts"] = generateTransport(options);
  files[".env.example"] = generateEnvExample(tools, securitySchemes, options);
  files["README.md"] = generateReadme(options, tools, securitySchemes);

  return files;
}

function generatePackageJson(options: GeneratorOptions): string {
  const isHostedWorker = isHostedWorkerMode(options);

  const pkg = {
    name: options.name,
    version: options.version || "1.0.0",
    description: `MCP runtime generated from OpenAPI`,
    type: "module",
    main: "build/index.js",
    scripts: isHostedWorker
      ? {
          build: "tsc",
          start: "node build/index.js --transport=streamable-http",
          "start:http": "node build/index.js --transport=streamable-http",
          dev: "tsc --watch",
        }
      : {
          build: "tsc",
          start: "node build/index.js",
          "start:http": "node build/index.js --transport=streamable-http",
          dev: "tsc --watch",
        },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.10.0",
      "@hono/node-server": "^1.14.1",
      axios: "^1.9.0",
      dotenv: "^16.4.5",
      hono: "^4.7.7",
      ...(options.emcyEnabled
        ? {
            "@emcy/sdk": options.localSdkPath
              ? `file:${options.localSdkPath}`
              : "^0.1.0",
          }
        : {}),
    },
    devDependencies: {
      "@types/node": "^22.15.2",
      typescript: "^5.8.3",
    },
    engines: {
      node: ">=20.0.0",
    },
  };

  return JSON.stringify(pkg, null, 2);
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022"],
      outDir: "./build",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      sourceMap: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "build"],
  };

  return JSON.stringify(config, null, 2);
}

function generateServerEntry(
  tools: McpToolDefinition[],
  options: GeneratorOptions,
  securitySchemes: Record<string, SecurityScheme>
): string {
  const runtimeMode = getRuntimeMode(options);
  const hasHostedWorker = runtimeMode === "emcy_hosted_worker";
  const configuredHeaders = options.upstreamHeaders ?? [];

  const toolDefinitions = tools
    .map(
      (tool) => `  ["${tool.name}", {
    name: "${tool.name}",
    description: ${JSON.stringify(tool.description)},
    inputSchema: ${JSON.stringify(tool.inputSchema)},
    method: "${tool.httpMethod}",
    pathTemplate: "${tool.pathTemplate}",
    parameters: ${JSON.stringify(tool.parameters)},
    requestBodyContentType: ${
      tool.requestBodyContentType
        ? `"${tool.requestBodyContentType}"`
        : "undefined"
    },
    securitySchemes: ${JSON.stringify(tool.securitySchemes)},
    requiredScopes: ${JSON.stringify(tool.requiredScopes)},
  }]`
    )
    .join(",\n");

  const emcyImport = options.emcyEnabled
    ? `import { EmcyTelemetry } from "@emcy/sdk";\n`
    : "";

  const emcyInit = options.emcyEnabled
    ? `
const emcy = process.env.EMCY_API_KEY
  ? new EmcyTelemetry({
      apiKey: process.env.EMCY_API_KEY,
      endpoint: process.env.EMCY_TELEMETRY_URL,
      mcpServerId: process.env.EMCY_MCP_SERVER_ID,
      debug: process.env.EMCY_DEBUG === "true",
    })
  : null;

if (emcy) {
  emcy.setServerInfo(SERVER_NAME, SERVER_VERSION);
}
`
    : "";

  const emcyTrace = options.emcyEnabled
    ? `
    if (emcy) {
      return emcy.trace(toolName, async () =>
        executeRequest(toolDefinition, toolArgs ?? {}, getUpstreamAccessToken?.())
      );
    }
`
    : "";

  const hostedWorkerConfig = hasHostedWorker
    ? `
const HOSTED_WORKER_CONFIG = {
  workerSecretHeader: process.env.EMCY_WORKER_SECRET_HEADER || ${JSON.stringify(
    options.hostedWorkerConfig?.workerSecretHeader || "x-emcy-worker-secret"
  )},
  workerSecretEnvVar: process.env.EMCY_WORKER_SECRET_ENV_VAR || ${JSON.stringify(
    options.hostedWorkerConfig?.workerSecretEnvVar || "EMCY_WORKER_SHARED_SECRET"
  )},
  upstreamAccessTokenHeader: process.env.EMCY_UPSTREAM_ACCESS_TOKEN_HEADER || ${JSON.stringify(
    options.hostedWorkerConfig?.upstreamAccessTokenHeader ||
      "x-emcy-upstream-access-token"
  )},
};
`
    : "";

  const upstreamHeaderConfig = `
type RuntimeMode = "standalone_no_auth" | "standalone_headers" | "emcy_hosted_worker";
const RUNTIME_MODE: RuntimeMode = ${JSON.stringify(runtimeMode)};
const UPSTREAM_HEADERS = ${JSON.stringify(configuredHeaders, null, 2)} as const;
`;

  const hasPrompts = options.prompts && options.prompts.length > 0;
  const promptsImport = hasPrompts
    ? `,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  type GetPromptResult`
    : "";

  const promptDefinitions = hasPrompts
    ? generatePromptDefinitions(options.prompts!)
    : "";

  const promptsCapability = hasPrompts ? ", prompts: {}" : "";
  const promptHandlers = hasPrompts ? generatePromptHandlers() : "";

  return `#!/usr/bin/env node
/**
 * MCP Runtime: ${options.name}
 * Generated by Emcy OpenAPI-to-MCP
 */

import dotenv from "dotenv";
dotenv.config();

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type Tool${promptsImport}
} from "@modelcontextprotocol/sdk/types.js";
import axios, { type AxiosRequestConfig } from "axios";
import { setupStreamableHttpServer } from "./transport.js";
${emcyImport}
export const SERVER_NAME = "${options.name}";
export const SERVER_VERSION = "${options.version || "1.0.0"}";
export const API_BASE_URL = process.env.API_BASE_URL || "${options.baseUrl}";

interface RuntimeToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  method: string;
  pathTemplate: string;
  parameters: { name: string; in: string; required: boolean }[];
  requestBodyContentType?: string;
  securitySchemes: string[];
  requiredScopes: string[];
}

interface RuntimeUpstreamHeader {
  name: string;
  envVar: string;
  valuePrefix?: string;
  defaultValue?: string;
}

const securitySchemes: Record<string, unknown> = ${JSON.stringify(
    securitySchemes,
    null,
    2
  )};
${upstreamHeaderConfig}${hostedWorkerConfig}${emcyInit}
const toolDefinitionMap: Map<string, RuntimeToolDefinition> = new Map([
${toolDefinitions}
]);
${promptDefinitions}

export function createServer(getUpstreamAccessToken?: () => string | undefined): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}${promptsCapability} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const toolsForClient: Tool[] = Array.from(toolDefinitionMap.values()).map((def) => ({
      name: def.name,
      description: def.description,
      inputSchema: def.inputSchema as Tool["inputSchema"],
    }));
    return { tools: toolsForClient };
  });

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest): Promise<CallToolResult> => {
      const { name: toolName, arguments: toolArgs } = request.params;
      const toolDefinition = toolDefinitionMap.get(toolName);

      if (!toolDefinition) {
        return {
          content: [{ type: "text", text: \`Error: Unknown tool: \${toolName}\` }],
          isError: true,
        };
      }

      try {
${emcyTrace}
        return await executeRequest(
          toolDefinition,
          toolArgs ?? {},
          getUpstreamAccessToken?.()
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: \`Error: \${message}\` }],
          isError: true,
        };
      }
    }
  );
${promptHandlers}
  return server;
}

async function executeRequest(
  def: RuntimeToolDefinition,
  args: Record<string, unknown>,
  upstreamAccessToken?: string
): Promise<CallToolResult> {
  let url = def.pathTemplate;
  const queryParams: Record<string, unknown> = {};
  const headers: Record<string, string> = { accept: "application/json" };

  for (const param of def.parameters) {
    const value = args[param.name];
    if (value === undefined || value === null) {
      continue;
    }

    if (param.in === "path") {
      url = url.replace(\`{\${param.name}}\`, encodeURIComponent(String(value)));
    } else if (param.in === "query") {
      queryParams[param.name] = value;
    } else if (param.in === "header") {
      headers[param.name.toLowerCase()] = String(value);
    }
  }

  applySecurityHeaders(headers, def.securitySchemes);
  applyConfiguredUpstreamHeaders(headers);
  applyHostedWorkerAccessToken(headers, upstreamAccessToken);

  const config: AxiosRequestConfig = {
    method: def.method,
    url: \`\${API_BASE_URL}\${url}\`,
    params: queryParams,
    headers,
  };

  if (def.requestBodyContentType && args.requestBody !== undefined) {
    config.data = args.requestBody;
    headers["content-type"] = def.requestBodyContentType;
  }

  if (def.requestBodyContentType && !config.data) {
    const paramNames = new Set(def.parameters.map((p) => p.name));
    const bodyArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (key !== "requestBody" && !paramNames.has(key)) {
        bodyArgs[key] = value;
      }
    }

    if (Object.keys(bodyArgs).length > 0) {
      config.data = bodyArgs;
      headers["content-type"] = def.requestBodyContentType;
    }
  }

  const response = await axios(config);
  const responseText =
    typeof response.data === "object"
      ? JSON.stringify(response.data, null, 2)
      : String(response.data ?? "");

  return {
    content: [{ type: "text", text: \`Status: \${response.status}\\n\\n\${responseText}\` }],
  };
}

function applySecurityHeaders(headers: Record<string, string>, schemeNames: string[]): void {
  if (RUNTIME_MODE !== "standalone_headers") {
    return;
  }

  for (const schemeName of schemeNames) {
    const scheme = securitySchemes[schemeName] as Record<string, unknown> | undefined;
    if (!scheme) {
      continue;
    }

    const resolvedEnvKey = schemeName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();

    if (scheme.type === "apiKey") {
      const apiKey = process.env[\`API_KEY_\${resolvedEnvKey}\`];
      if (apiKey && scheme.in === "header" && typeof scheme.name === "string") {
        headers[scheme.name.toLowerCase()] = apiKey;
      }
      continue;
    }

    if (scheme.type === "http" && scheme.scheme === "bearer") {
      const bearerToken = process.env[\`BEARER_TOKEN_\${resolvedEnvKey}\`];
      if (bearerToken) {
        headers.authorization = \`Bearer \${bearerToken}\`;
      }
    }
  }
}

function applyConfiguredUpstreamHeaders(headers: Record<string, string>): void {
  for (const header of UPSTREAM_HEADERS as readonly RuntimeUpstreamHeader[]) {
    const rawValue = process.env[header.envVar] || header.defaultValue;
    if (!rawValue) {
      continue;
    }

    headers[header.name.toLowerCase()] = header.valuePrefix
      ? \`\${header.valuePrefix} \${rawValue}\`
      : rawValue;
  }
}

function applyHostedWorkerAccessToken(
  headers: Record<string, string>,
  upstreamAccessToken?: string
): void {
  if (RUNTIME_MODE !== "emcy_hosted_worker" || !upstreamAccessToken) {
    return;
  }

  headers.authorization = \`Bearer \${upstreamAccessToken}\`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useHttp = args.includes("--transport=streamable-http");
  const port = parseInt(process.env.PORT || "3000", 10);

  if (RUNTIME_MODE === "emcy_hosted_worker" || useHttp) {
    await setupStreamableHttpServer(port${hasHostedWorker ? ", HOSTED_WORKER_CONFIG" : ""});
    return;
  }

  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(\`\${SERVER_NAME} running on stdio\`);
}

main().catch(console.error);
`;
}

function generatePromptDefinitions(prompts: PromptDefinition[]): string {
  return `

interface PromptDef {
  name: string;
  title?: string;
  description: string;
  content: string;
  arguments?: { name: string; description: string; required: boolean }[];
}

const promptDefinitionMap: Map<string, PromptDef> = new Map([
${prompts
  .map(
    (prompt) => `  ["${prompt.name}", {
    name: "${prompt.name}",
    ${prompt.title ? `title: ${JSON.stringify(prompt.title)},` : ""}
    description: ${JSON.stringify(prompt.description)},
    content: ${JSON.stringify(prompt.content)},
    ${prompt.arguments ? `arguments: ${JSON.stringify(prompt.arguments)},` : ""}
  }]`
  )
  .join(",\n")}
]);`;
}

function generatePromptHandlers(): string {
  return `

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const promptsForClient = Array.from(promptDefinitionMap.values()).map((def) => ({
      name: def.name,
      title: def.title,
      description: def.description,
      arguments: def.arguments,
    }));

    return { prompts: promptsForClient };
  });

  server.setRequestHandler(
    GetPromptRequestSchema,
    async (request): Promise<GetPromptResult> => {
      const { name, arguments: args } = request.params;
      const promptDef = promptDefinitionMap.get(name);

      if (!promptDef) {
        throw new Error(\`Unknown prompt: \${name}\`);
      }

      let content = promptDef.content;
      if (args && promptDef.arguments) {
        for (const argDef of promptDef.arguments) {
          const value = args[argDef.name];
          if (value !== undefined) {
            content = content.replace(
              new RegExp(\`{{\\\\s*\${argDef.name}\\\\s*}}\`, "g"),
              String(value)
            );
          } else if (argDef.required) {
            throw new Error(\`Missing required argument: \${argDef.name}\`);
          }
        }
      }

      return {
        messages: [
          {
            role: "user",
            content: { type: "text", text: content },
          },
        ],
      };
    }
  );`;
}

function generateTransport(options: GeneratorOptions): string {
  const runtimeMode = getRuntimeMode(options);
  const hasHostedWorker = runtimeMode === "emcy_hosted_worker";

  const hostedWorkerTypes = hasHostedWorker
    ? `
interface HostedWorkerRuntimeConfig {
  workerSecretHeader: string;
  workerSecretEnvVar: string;
  upstreamAccessTokenHeader: string;
}

let hostedWorkerRuntimeConfig: HostedWorkerRuntimeConfig | undefined;

function getHostedWorkerConfig(): HostedWorkerRuntimeConfig {
  if (!hostedWorkerRuntimeConfig) {
    throw new Error("Hosted worker runtime config was not initialized.");
  }

  return hostedWorkerRuntimeConfig;
}
`
    : "";

  const requestTokenResolver = hasHostedWorker
    ? `
function getRequestAccessToken(c: any): string | undefined {
  const forwarded = c.req.header(getHostedWorkerConfig().upstreamAccessTokenHeader);
  if (forwarded) {
    return forwarded;
  }

  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  return undefined;
}
`
    : `
function getRequestAccessToken(_c: any): string | undefined {
  return undefined;
}
`;

  const hostedWorkerMiddleware = hasHostedWorker
    ? `
  app.use("/mcp", async (c, next) => {
    const workerConfig = getHostedWorkerConfig();
    const expectedSecret = process.env[workerConfig.workerSecretEnvVar];

    if (!expectedSecret) {
      return c.json(
        {
          error: "server_error",
          error_description: \`Missing worker secret env var: \${workerConfig.workerSecretEnvVar}\`,
        },
        500
      );
    }

    const providedSecret = c.req.header(workerConfig.workerSecretHeader);
    if (providedSecret !== expectedSecret) {
      return c.json(
        {
          error: "unauthorized",
          error_description: "Internal worker secret is missing or invalid.",
        },
        401
      );
    }

    return next();
  });
`
    : "";

  const startupDetails = hasHostedWorker
    ? `
    console.error(\`║  Mode:   Emcy hosted worker                                  ║\`);
    console.error(\`║  Header: \${getHostedWorkerConfig().workerSecretHeader.padEnd(53)} ║\`);
    console.error(\`║  Clients: Emcy should call this worker, not end users.      ║\`);
`
    : `
    console.error(\`║  Mode:   Standalone MCP server                               ║\`);
    console.error(\`║  HTTP:   http://localhost:\${info.port}/mcp\`.padEnd(64) + \`║\`);
    console.error(\`║  Stdio:  npm start\`.padEnd(64) + \`║\`);
`;

  return `/**
 * Streamable HTTP transport for the generated MCP runtime.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./index.js";
${hostedWorkerTypes}
const { WebStandardStreamableHTTPServerTransport } = await import(
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
);

const transports: Map<string, InstanceType<typeof WebStandardStreamableHTTPServerTransport>> = new Map();
const sessionTokens: Map<string, { current: string }> = new Map();
${requestTokenResolver}

export async function setupStreamableHttpServer(
  port = 3000${hasHostedWorker ? ", hostedWorkerConfig?: HostedWorkerRuntimeConfig" : ""}
): Promise<Hono> {
${hasHostedWorker ? "  hostedWorkerRuntimeConfig = hostedWorkerConfig;\n" : ""}  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Accept",
        "Authorization",
        "mcp-session-id",
        "Last-Event-ID",
        "x-emcy-worker-secret",
        "x-emcy-upstream-access-token",
      ],
      exposeHeaders: ["mcp-session-id"],
    })
  );
${hostedWorkerMiddleware}
  app.get("/health", (c) => {
    return c.json({
      status: "OK",
      server: SERVER_NAME,
      version: SERVER_VERSION,
      mcp: {
        transport: "streamable-http",
        endpoints: {
          mcp: "/mcp",
          health: "/health",
        },
${hasHostedWorker ? `        hosted_worker: {
          enabled: true,
          worker_secret_header: getHostedWorkerConfig().workerSecretHeader,
          upstream_access_token_header: getHostedWorkerConfig().upstreamAccessTokenHeader,
        },` : `        public_server: true,`}
      },
    });
  });

  app.all("/mcp", async (c) => {
    const sessionId = c.req.header("mcp-session-id");

    if (sessionId && transports.has(sessionId)) {
      const tokenRef = sessionTokens.get(sessionId);
      if (tokenRef) {
        const requestToken = getRequestAccessToken(c);
        if (requestToken) {
          tokenRef.current = requestToken;
        }
      }

      return transports.get(sessionId)!.handleRequest(c.req.raw);
    }

    if (!sessionId) {
      const sessionTokenRef = { current: "" };
      const requestToken = getRequestAccessToken(c);
      if (requestToken) {
        sessionTokenRef.current = requestToken;
      }

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId: string) => {
          transports.set(newSessionId, transport);
          sessionTokens.set(newSessionId, sessionTokenRef);
          console.error(\`New MCP session: \${newSessionId}\`);
        },
      });

      transport.onerror = (err: Error) => console.error("Transport error:", err);
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (!sid) {
          return;
        }

        transports.delete(sid);
        sessionTokens.delete(sid);
        console.error(\`Session closed: \${sid}\`);
      };

      const sessionServer = createServer(
        () => sessionTokenRef.current || undefined
      );
      await sessionServer.connect(transport);
      return transport.handleRequest(c.req.raw);
    }

    return c.json(
      {
        error: "Session not found",
        message:
          "The specified session ID does not exist. Start a new session by omitting the mcp-session-id header.",
      },
      404
    );
  });

  app.get("/sse", (c) => {
    return c.json(
      {
        error: "SSE transport deprecated",
        message:
          "The SSE transport was deprecated in MCP specification 2025-03-26. Please use /mcp instead.",
        redirect: "/mcp",
      },
      410
    );
  });

  serve({ fetch: app.fetch, port }, (info) => {
    console.error("");
    console.error("╔═══════════════════════════════════════════════════════════════╗");
    console.error(\`║  MCP Runtime: \${SERVER_NAME.padEnd(45)} ║\`);
    console.error("╠═══════════════════════════════════════════════════════════════╣");
    console.error(\`║  Status: Running                                              ║\`);
    console.error(\`║  Port:   \${String(info.port).padEnd(53)} ║\`);
    console.error("╠═══════════════════════════════════════════════════════════════╣");
${startupDetails}
    console.error("╚═══════════════════════════════════════════════════════════════╝");
    console.error("");
  });

  return app;
}
`;
}

function generateEnvExample(
  tools: McpToolDefinition[],
  securitySchemes: Record<string, SecurityScheme>,
  options: GeneratorOptions
): string {
  const runtimeMode = getRuntimeMode(options);
  const lines = [
    "# API Configuration",
    `API_BASE_URL=${options.baseUrl}`,
    "",
    "# Emcy Telemetry (optional)",
    "# EMCY_API_KEY=your-api-key-from-emcy-dashboard",
    "# EMCY_TELEMETRY_URL=http://localhost:5140/api/v1/telemetry",
    "# EMCY_MCP_SERVER_ID=mcp_xxxxxxxxxxxx",
    "# EMCY_DEBUG=false",
    "",
    "# Server Port",
    "PORT=3000",
  ];

  if (runtimeMode === "emcy_hosted_worker") {
    lines.push(
      "",
      "# Hosted worker configuration",
      "EMCY_WORKER_SHARED_SECRET=change-me",
      "# EMCY_WORKER_SECRET_HEADER=x-emcy-worker-secret",
      "# EMCY_UPSTREAM_ACCESS_TOKEN_HEADER=x-emcy-upstream-access-token"
    );
  }

  const configuredHeaders = options.upstreamHeaders ?? [];
  if (configuredHeaders.length > 0) {
    lines.push("", "# Configured upstream headers");
    const seenEnvVars = new Set<string>();
    for (const header of configuredHeaders) {
      if (seenEnvVars.has(header.envVar)) {
        continue;
      }

      seenEnvVars.add(header.envVar);
      if (header.valuePrefix) {
        lines.push(
          `# ${header.name} will be sent as "${header.valuePrefix} <value>"`
        );
      } else {
        lines.push(`# ${header.name} will be sent as-is`);
      }
      lines.push(`${header.envVar}=${header.defaultValue ?? ""}`);
    }
  }

  if (runtimeMode === "standalone_headers") {
    const usedSchemes = new Set<string>();
    for (const tool of tools) {
      for (const scheme of tool.securitySchemes) {
        usedSchemes.add(scheme);
      }
    }

    const schemeLines: string[] = [];
    for (const schemeName of usedSchemes) {
      const scheme = securitySchemes[schemeName];
      const envKey = toEnvKey(schemeName);

      if (scheme?.type === "apiKey" && scheme.in === "header") {
        schemeLines.push(`API_KEY_${envKey}=`);
      } else if (scheme?.type === "http" && scheme.scheme === "bearer") {
        schemeLines.push(`BEARER_TOKEN_${envKey}=`);
      }
    }

    if (schemeLines.length > 0) {
      lines.push("", "# OpenAPI-derived upstream credentials");
      lines.push(...schemeLines);
    }
  }

  return lines.join("\n");
}

function generateReadme(
  options: GeneratorOptions,
  tools: McpToolDefinition[],
  securitySchemes: Record<string, SecurityScheme>
): string {
  const runtimeMode = getRuntimeMode(options);
  const configuredHeaders = options.upstreamHeaders ?? [];
  const hasPrompts = options.prompts && options.prompts.length > 0;
  const promptSection = hasPrompts
    ? `
## Context Prompts

This runtime includes ${options.prompts!.length} pre-defined prompt(s):

${options.prompts!.map((prompt) => `- **${prompt.name}**: ${prompt.description}`).join("\n")}
`
    : "";

  if (runtimeMode === "emcy_hosted_worker") {
    return `# ${options.name}

Hosted worker runtime generated from an OpenAPI specification by [Emcy](https://emcy.ai).
${promptSection}
## Runtime Mode

This runtime is intended to run behind Emcy-hosted MCP auth.

- Emcy owns the public MCP URL and OAuth flow
- Emcy forwards a short-lived downstream access token to this worker
- MCP clients should connect to Emcy, not directly to this worker

## Quick Start

\`\`\`bash
npm install
npm run build
npm run start:http
\`\`\`

## Configuration

Copy \`.env.example\` to \`.env\` and configure:

- \`API_BASE_URL\`: Base URL of the downstream API
- \`PORT\`: HTTP port for the worker runtime
- \`EMCY_WORKER_SHARED_SECRET\`: Shared secret Emcy uses to call the worker

## Local Validation

1. Run the worker with \`npm run start:http\`
2. Configure Emcy to call this worker
3. Let Emcy host the public MCP server, OAuth flow, and client registration
4. Validate tool calls through Emcy
`;
  }

  const derivedSecuritySupport = Array.from(
    new Set(
      tools.flatMap((tool) => tool.securitySchemes).map((schemeName) => {
        const scheme = securitySchemes[schemeName];
        if (scheme?.type === "apiKey") {
          return `${schemeName} (API key)`;
        }
        if (scheme?.type === "http" && scheme.scheme === "bearer") {
          return `${schemeName} (Bearer token)`;
        }
        return null;
      })
    )
  ).filter(Boolean);

  return `# ${options.name}

MCP server generated from an OpenAPI specification by [Emcy](https://emcy.ai).
${promptSection}
## Runtime Mode

\`${runtimeMode}\`

${runtimeMode === "standalone_headers"
  ? `This server runs as a standalone MCP endpoint and injects static headers into upstream API calls.

- Configured headers: ${formatHeaderDescription(configuredHeaders)}
- OpenAPI header security schemes: ${derivedSecuritySupport.length > 0 ? derivedSecuritySupport.join(", ") : "none detected"}`
  : `This server runs as a standalone MCP endpoint with no built-in upstream authentication logic.`}

## Quick Start

\`\`\`bash
npm install
npm run build

# Streamable HTTP
npm run start:http

# Or stdio for local desktop clients
npm start
\`\`\`

## Configuration

Copy \`.env.example\` to \`.env\`.

- \`API_BASE_URL\`: Base URL of the target API
- \`PORT\`: HTTP port for the MCP server
${runtimeMode === "standalone_headers" ? "- Set the configured header env vars before starting the server" : ""}

## Client Usage

- HTTP clients: connect to \`http://localhost:3000/mcp\`
- Stdio clients: run \`npm start\`

## Notes

- This generator no longer produces standalone public OAuth resource servers.
- For user-scoped OAuth APIs, use Emcy-hosted MCP auth with \`emcy_hosted_worker\` mode.
`;
}
