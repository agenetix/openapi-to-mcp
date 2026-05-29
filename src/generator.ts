/**
 * Code generator for OpenAPI -> MCP runtimes.
 *
 * Supported runtime modes:
 * - standalone_no_auth
 * - standalone_headers
 * - mcpstack_gateway_worker
 */

import type {
  McpStackGatewayIntegrationConfig,
  GeneratorOptions,
  GeneratedFiles,
  HostedOauthConfig,
  McpToolDefinition,
  PromptDefinition,
  RuntimeMode,
  SecurityScheme,
  ToolInstructionConfig,
  UpstreamHeaderConfig,
} from "./types.js";

function normalizeRuntimeModeAlias(runtimeMode: RuntimeMode): RuntimeMode {
  return runtimeMode;
}

function isGatewayWorkerMode(runtimeMode: RuntimeMode): boolean {
  return normalizeRuntimeModeAlias(runtimeMode) === "mcpstack_gateway_worker";
}

function resolveMcpStackGatewayIntegration(
  options: GeneratorOptions,
): McpStackGatewayIntegrationConfig | undefined {
  if (options.gatewayIntegration?.provider === "mcpstack") {
    return options.gatewayIntegration;
  }

  if (options.hostedOauthConfig || options.hostedWorkerConfig) {
    return {
      provider: "mcpstack",
      ...(options.hostedOauthConfig
        ? { oauth: options.hostedOauthConfig }
        : {}),
      ...(options.hostedWorkerConfig
        ? { worker: options.hostedWorkerConfig }
        : {}),
    };
  }

  return undefined;
}

function getRuntimeMode(options: GeneratorOptions): RuntimeMode {
  if (resolveMcpStackGatewayIntegration(options)) {
    return "mcpstack_gateway_worker";
  }

  if (options.runtimeMode) {
    return normalizeRuntimeModeAlias(options.runtimeMode);
  }

  if (options.hostedWorkerConfig) {
    return "mcpstack_gateway_worker";
  }

  if ((options.upstreamHeaders?.length ?? 0) > 0) {
    return "standalone_headers";
  }

  return "standalone_no_auth";
}

function isGatewayBackedRuntime(options: GeneratorOptions): boolean {
  return isGatewayWorkerMode(getRuntimeMode(options));
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
        : `${header.name} (<${header.envVar}>)`,
    )
    .join(", ");
}

function formatGatewayOauthDescription(config?: HostedOauthConfig): string {
  if (!config) {
    return "none";
  }

  return [
    config.provider || "manual",
    config.authorizationServerUrl,
    config.clientId ? `client ${config.clientId}` : undefined,
    config.resource ? `resource ${config.resource}` : undefined,
  ]
    .filter(Boolean)
    .join(" | ");
}

function formatToolInstructionSummary(
  toolInstructions?: Record<string, ToolInstructionConfig>,
): string {
  const entries = Object.entries(toolInstructions ?? {}).filter(([, config]) =>
    Object.values(config).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    ),
  );

  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([toolKey]) => toolKey).join(", ");
}

function formatToolDescriptionWithInstructions(
  description: string,
  instruction?: ToolInstructionConfig,
): string {
  if (!instruction) {
    return description;
  }

  const sections = [
    instruction.customInstructions?.trim()
      ? `Custom instructions: ${instruction.customInstructions.trim()}`
      : null,
    instruction.whenToUse?.trim()
      ? `When to use: ${instruction.whenToUse.trim()}`
      : null,
    instruction.whenNotToUse?.trim()
      ? `When not to use: ${instruction.whenNotToUse.trim()}`
      : null,
    instruction.exampleUsage?.trim()
      ? `Example usage: ${instruction.exampleUsage.trim()}`
      : null,
  ].filter((value): value is string => Boolean(value));

  if (sections.length === 0) {
    return description;
  }

  return `${description}\n\nAI usage guidance:\n- ${sections.join("\n- ")}`;
}

function getToolInstructions(
  tool: McpToolDefinition,
  toolInstructions?: Record<string, ToolInstructionConfig>,
): ToolInstructionConfig | undefined {
  if (!toolInstructions) {
    return undefined;
  }

  const aliasInstruction = tool.aliases
    ?.map((alias) => toolInstructions[alias])
    .find((instruction): instruction is ToolInstructionConfig => Boolean(instruction));

  return toolInstructions[tool.name] ?? aliasInstruction;
}

/**
 * Generate a complete MCP server from tool definitions.
 */
export function generateMcpServer(
  tools: McpToolDefinition[],
  options: GeneratorOptions,
  securitySchemes: Record<string, SecurityScheme> = {},
): GeneratedFiles {
  const files: GeneratedFiles = {};

  files["package.json"] = generatePackageJson(options);
  files["tsconfig.json"] = generateTsConfig();
  files["src/index.ts"] = generateServerEntry(tools, options, securitySchemes);
  files["src/transport.ts"] = generateTransport(options, tools.length);
  files[".env.example"] = generateEnvExample(tools, securitySchemes, options);
  files["README.md"] = generateReadme(options, tools, securitySchemes);

  return files;
}

function generatePackageJson(options: GeneratorOptions): string {
  const isHostedWorker = isGatewayBackedRuntime(options);

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
      ...(options.mcpStackTelemetryEnabled
        ? {
            "@mcpstack/sdk": options.localMcpStackSdkPath
              ? `file:${options.localMcpStackSdkPath}`
              : "^1.0.0",
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
  securitySchemes: Record<string, SecurityScheme>,
): string {
  const runtimeMode = getRuntimeMode(options);
  const hasHostedWorker = isGatewayWorkerMode(runtimeMode);
  const configuredHeaders = options.upstreamHeaders ?? [];
  const gatewayIntegration = resolveMcpStackGatewayIntegration(options);
  const gatewayOauthConfig =
    gatewayIntegration?.oauth ?? options.hostedOauthConfig;
  const toolInstructions = options.toolInstructions;

  const toolDefinitions = tools
    .map(
      (tool) => `  {
    name: "${tool.name}",
    aliases: ${JSON.stringify(tool.aliases ?? [])},
    description: ${JSON.stringify(
      formatToolDescriptionWithInstructions(
        tool.description,
        getToolInstructions(tool, toolInstructions),
      ),
    )},
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
  }`,
    )
    .join(",\n");

  const emcyImport = options.mcpStackTelemetryEnabled
    ? `import { McpStackTelemetry } from "@mcpstack/sdk";\n`
    : "";

  const emcyInit = options.mcpStackTelemetryEnabled
    ? `
const mcpstack = process.env.MCPSTACK_API_KEY
  ? new McpStackTelemetry({
      apiKey: process.env.MCPSTACK_API_KEY,
      endpoint: process.env.MCPSTACK_TELEMETRY_URL,
      mcpServerId: process.env.MCPSTACK_MCP_SERVER_ID,
      debug: process.env.MCPSTACK_DEBUG === "true",
    })
  : null;

if (mcpstack) {
  mcpstack.setServerInfo(SERVER_NAME, SERVER_VERSION);
}
`
    : "";

  const emcyTrace = options.mcpStackTelemetryEnabled
    ? `
    if (mcpstack) {
      return mcpstack.trace(toolName, async () =>
        executeRequest(toolDefinition, toolArgs ?? {}, getUpstreamAccessToken?.())
      );
    }
`
    : "";

  const gatewayWorkerConfigBlock = hasHostedWorker
    ? `
const GATEWAY_WORKER_CONFIG = {
  workerSecretHeader: process.env.MCPSTACK_WORKER_SECRET_HEADER || ${JSON.stringify(
    gatewayIntegration?.worker?.workerSecretHeader ||
      options.hostedWorkerConfig?.workerSecretHeader ||
      "x-mcpstack-worker-secret",
  )},
  workerSecretEnvVar: process.env.MCPSTACK_WORKER_SECRET_ENV_VAR || ${JSON.stringify(
    gatewayIntegration?.worker?.workerSecretEnvVar ||
      options.hostedWorkerConfig?.workerSecretEnvVar ||
      "MCPSTACK_WORKER_SHARED_SECRET",
  )},
  upstreamAccessTokenHeader: process.env.MCPSTACK_UPSTREAM_ACCESS_TOKEN_HEADER || ${JSON.stringify(
    gatewayIntegration?.worker?.upstreamAccessTokenHeader ||
      options.hostedWorkerConfig?.upstreamAccessTokenHeader ||
      "x-mcpstack-upstream-access-token",
  )},
};
`
    : "";

  const upstreamHeaderConfig = `
type RuntimeMode = "standalone_no_auth" | "standalone_headers" | "mcpstack_gateway_worker";
const RUNTIME_MODE: RuntimeMode = ${JSON.stringify(runtimeMode)};
const UPSTREAM_HEADERS: RuntimeUpstreamHeader[] = ${JSON.stringify(configuredHeaders, null, 2)};
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
 * Generated by MCP Stack OpenAPI-to-MCP
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
  aliases: string[];
  method: string;
  pathTemplate: string;
  parameters: {
    name: string;
    in: string;
    required: boolean;
    description?: string;
    schema?: Record<string, unknown>;
  }[];
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

interface RuntimeGatewayOauthConfig {
  provider?: string;
  authorizationServerUrl?: string;
  clientId?: string;
  resource?: string;
  scopes?: string[];
}

interface RuntimeToolInstruction {
  customInstructions?: string;
  exampleUsage?: string;
  whenToUse?: string;
  whenNotToUse?: string;
}

const securitySchemes: Record<string, unknown> = ${JSON.stringify(
    securitySchemes,
    null,
    2,
  )};
${upstreamHeaderConfig}${gatewayWorkerConfigBlock}${emcyInit}
const GATEWAY_OAUTH_CONFIG: RuntimeGatewayOauthConfig | null = ${JSON.stringify(gatewayOauthConfig ?? null, null, 2)};
const TOOL_INSTRUCTIONS: Record<string, RuntimeToolInstruction> = ${JSON.stringify(toolInstructions ?? {}, null, 2)};
const TOOL_CALL_TIMEOUT_SECONDS = Number.parseInt(process.env.MCPSTACK_TOOL_CALL_TIMEOUT_SECONDS || "0", 10);
const toolDefinitions: RuntimeToolDefinition[] = [
${toolDefinitions}
];
const toolDefinitionMap: Map<string, RuntimeToolDefinition> = new Map();
for (const toolDefinition of toolDefinitions) {
  toolDefinitionMap.set(toolDefinition.name, toolDefinition);
  for (const alias of toolDefinition.aliases) {
    toolDefinitionMap.set(alias, toolDefinition);
  }
}
${promptDefinitions}

export function createServer(getUpstreamAccessToken?: () => string | undefined): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}${promptsCapability} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const toolsForClient: Tool[] = toolDefinitions
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((def) => ({
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
  applyGatewayWorkerAccessToken(headers, upstreamAccessToken);

  const config: AxiosRequestConfig = {
    method: def.method,
    url: \`\${API_BASE_URL}\${url}\`,
    params: queryParams,
    headers,
  };

  if (Number.isFinite(TOOL_CALL_TIMEOUT_SECONDS) && TOOL_CALL_TIMEOUT_SECONDS > 0) {
    config.timeout = TOOL_CALL_TIMEOUT_SECONDS * 1000;
  }

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
  for (const header of UPSTREAM_HEADERS) {
    const rawValue = process.env[header.envVar] || header.defaultValue;
    if (!rawValue) {
      continue;
    }

    headers[header.name.toLowerCase()] = header.valuePrefix
      ? \`\${header.valuePrefix} \${rawValue}\`
      : rawValue;
  }
}

function applyGatewayWorkerAccessToken(
  headers: Record<string, string>,
  upstreamAccessToken?: string
): void {
  if (RUNTIME_MODE !== "mcpstack_gateway_worker" || !upstreamAccessToken) {
    return;
  }

  headers.authorization = \`Bearer \${upstreamAccessToken}\`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const useHttp = args.includes("--transport=streamable-http");
  const port = parseInt(process.env.PORT || "3000", 10);

  if (RUNTIME_MODE === "mcpstack_gateway_worker" || useHttp) {
    await setupStreamableHttpServer(port${hasHostedWorker ? ", GATEWAY_WORKER_CONFIG" : ""});
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
  }]`,
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

function generateTransport(options: GeneratorOptions, toolCount: number): string {
  const runtimeMode = getRuntimeMode(options);
  const hasHostedWorker = isGatewayWorkerMode(runtimeMode);

  const gatewayWorkerTypes = hasHostedWorker
    ? `
interface GatewayWorkerRuntimeConfig {
  workerSecretHeader: string;
  workerSecretEnvVar: string;
  upstreamAccessTokenHeader: string;
}

let gatewayWorkerRuntimeConfig: GatewayWorkerRuntimeConfig | undefined;

function getGatewayWorkerConfig(): GatewayWorkerRuntimeConfig {
  if (!gatewayWorkerRuntimeConfig) {
    throw new Error("Gateway worker runtime config was not initialized.");
  }

  return gatewayWorkerRuntimeConfig;
}
`
    : "";

  const requestTokenResolver = hasHostedWorker
    ? `
function getRequestAccessToken(c: any): string | undefined {
  const forwarded = c.req.header(getGatewayWorkerConfig().upstreamAccessTokenHeader);
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

  const gatewayWorkerMiddleware = hasHostedWorker
    ? `
  app.use("/mcp", async (c, next) => {
    if (process.env.MCPSTACK_ALLOW_DIRECT_MCP_CLIENTS === "true") {
      return next();
    }

    const workerConfig = getGatewayWorkerConfig();
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
    console.error(\`║  Mode:   Gateway-backed runtime                              ║\`);
    console.error(\`║  Header: \${getGatewayWorkerConfig().workerSecretHeader.padEnd(53)} ║\`);
    console.error(\`║  Clients: MCP Stack should call this worker, not end users.      ║\`);
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
${gatewayWorkerTypes}
const { WebStandardStreamableHTTPServerTransport } = await import(
  "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
);

const transports: Map<string, InstanceType<typeof WebStandardStreamableHTTPServerTransport>> = new Map();
const sessionTokens: Map<string, { current: string }> = new Map();
const DEFAULT_MCP_PROTOCOL_VERSION = process.env.MCP_PROTOCOL_VERSION || "2025-11-25";
const GENERATED_TOOL_COUNT = ${toolCount};
const CLAUDE_WEB_RECOMMENDED_TOOL_LIMIT = 20;
const MCP_CORS_HEADERS = [
  "Content-Type",
  "Accept",
  "Authorization",
  "MCP-Protocol-Version",
  "Mcp-Method",
  "Mcp-Name",
  "Mcp-Param-*",
  "mcp-session-id",
  "Last-Event-ID",
  "x-mcpstack-worker-secret",
  "x-mcpstack-upstream-access-token",
];
const MCP_EXPOSE_HEADERS = [
  "MCP-Protocol-Version",
  "Mcp-Method",
  "Mcp-Name",
  "mcp-session-id",
];
${requestTokenResolver}

function parseAllowedOrigins(): Set<string> {
  return new Set(
    (process.env.MCP_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  const allowedOrigins = parseAllowedOrigins();
  return allowedOrigins.has("*") || allowedOrigins.has(origin) || isLoopbackOrigin(origin);
}

function resolveCorsOrigin(origin: string): string {
  return isOriginAllowed(origin) ? origin : "";
}

function isAllowedCorsRequestHeader(header: string): boolean {
  const normalized = header.trim().toLowerCase();
  return normalized.length > 0 && (
    normalized.startsWith("mcp-param-") ||
    MCP_CORS_HEADERS.some((allowed) => allowed.toLowerCase() === normalized)
  );
}

async function readJsonRpcEnvelope(request: Request): Promise<unknown | null> {
  if (request.method.toUpperCase() !== "POST") {
    return null;
  }

  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

function getJsonRpcMethod(payload: unknown): string | undefined {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return undefined;
  }

  const method = (payload as { method?: unknown }).method;
  return typeof method === "string" ? method : undefined;
}

function getJsonRpcId(payload: unknown): unknown {
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return null;
  }

  return (payload as { id?: unknown }).id ?? null;
}

function isDraftDiscoveryEnabled(): boolean {
  return process.env.MCP_DRAFT_DISCOVERY_ENABLED === "true";
}

function buildDraftDiscoveryResponse(id: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      protocolVersion: DEFAULT_MCP_PROTOCOL_VERSION,
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      capabilities: {
        tools: {},
      },
    },
  };
}

export async function setupStreamableHttpServer(
  port = 3000${hasHostedWorker ? ", gatewayWorkerConfig?: GatewayWorkerRuntimeConfig" : ""}
): Promise<Hono> {
${hasHostedWorker ? "  gatewayWorkerRuntimeConfig = gatewayWorkerConfig;\n" : ""}  const app = new Hono();

  app.use("*", async (c, next) => {
    const origin = c.req.header("Origin") || c.req.header("origin");
    if (!isOriginAllowed(origin)) {
      return c.json(
        {
          error: "origin_not_allowed",
          error_description: "The request Origin is not allowed for this MCP runtime.",
        },
        403
      );
    }

    await next();

    c.header("MCP-Protocol-Version", DEFAULT_MCP_PROTOCOL_VERSION);
    const methodHeader = c.req.header("Mcp-Method") || c.req.header("mcp-method");
    if (methodHeader) {
      c.header("Mcp-Method", methodHeader);
    }
    const nameHeader = c.req.header("Mcp-Name") || c.req.header("mcp-name");
    if (nameHeader) {
      c.header("Mcp-Name", nameHeader);
    }

    const requestedHeaders = c.req.header("Access-Control-Request-Headers");
    if (requestedHeaders) {
      const headers = requestedHeaders.split(",").map((header) => header.trim()).filter(Boolean);
      if (headers.every(isAllowedCorsRequestHeader)) {
        c.header("Access-Control-Allow-Headers", headers.join(", "));
      }
    }
    c.header("Access-Control-Expose-Headers", MCP_EXPOSE_HEADERS.join(", "));
  });

  app.use(
    "*",
    cors({
      origin: resolveCorsOrigin,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: MCP_CORS_HEADERS,
      exposeHeaders: MCP_EXPOSE_HEADERS,
    })
  );
${gatewayWorkerMiddleware}
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
        protocolVersion: DEFAULT_MCP_PROTOCOL_VERSION,
        draftDiscovery: isDraftDiscoveryEnabled(),
        toolCount: GENERATED_TOOL_COUNT,
        client_readiness: {
          claude_web: {
            recommended_tool_limit: CLAUDE_WEB_RECOMMENDED_TOOL_LIMIT,
            status: GENERATED_TOOL_COUNT > CLAUDE_WEB_RECOMMENDED_TOOL_LIMIT ? "too_many_tools" : "ok",
          },
        },
${
  hasHostedWorker
    ? `        gateway_worker: {
          enabled: true,
          worker_secret_header: getGatewayWorkerConfig().workerSecretHeader,
          upstream_access_token_header: getGatewayWorkerConfig().upstreamAccessTokenHeader,
        },`
    : `        public_server: true,`
}
      },
    });
  });

  app.all("/mcp", async (c) => {
    const payload = await readJsonRpcEnvelope(c.req.raw);
    if (Array.isArray(payload)) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32600,
            message: "JSON-RPC batch requests are not supported by this MCP runtime.",
          },
        },
        400
      );
    }

    if (isDraftDiscoveryEnabled() && getJsonRpcMethod(payload) === "server/discover") {
      return c.json(buildDraftDiscoveryResponse(getJsonRpcId(payload)));
    }

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
  options: GeneratorOptions,
): string {
  const runtimeMode = getRuntimeMode(options);
  const gatewayIntegration = resolveMcpStackGatewayIntegration(options);
  const lines = [
    "# API Configuration",
    `API_BASE_URL=${options.baseUrl}`,
    "",
    "# MCP Stack Telemetry (optional)",
    "# MCPSTACK_API_KEY=your-api-key-from-mcpstack-dashboard",
    "# MCPSTACK_TELEMETRY_URL=http://localhost:5140/api/v1/telemetry",
    "# MCPSTACK_MCP_SERVER_ID=mcp_xxxxxxxxxxxx",
    "# MCPSTACK_DEBUG=false",
    "",
    "# Server Port",
    "PORT=3000",
    "",
    "# MCP HTTP compatibility",
    "# MCP_PROTOCOL_VERSION=2025-11-25",
    "# MCP_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000",
    "# MCP_DRAFT_DISCOVERY_ENABLED=false",
    "",
    "# Tool execution guardrail (optional)",
    "# MCPSTACK_TOOL_CALL_TIMEOUT_SECONDS=30",
  ];

  if (isGatewayWorkerMode(runtimeMode)) {
    lines.push(
      "",
      "# MCP Stack Gateway worker configuration",
      "MCPSTACK_WORKER_SHARED_SECRET=change-me",
      "# MCPSTACK_WORKER_SECRET_HEADER=x-mcpstack-worker-secret",
      "# MCPSTACK_UPSTREAM_ACCESS_TOKEN_HEADER=x-mcpstack-upstream-access-token",
    );
    if (gatewayIntegration?.oauth?.authorizationServerUrl) {
      lines.push(
        "",
        "# MCP Stack Gateway OAuth reference",
        `# Provider: ${gatewayIntegration.oauth.provider ?? "manual"}`,
        `# Authorization server: ${gatewayIntegration.oauth.authorizationServerUrl}`,
        `# Client ID: ${gatewayIntegration.oauth.clientId ?? ""}`,
        `# Resource: ${gatewayIntegration.oauth.resource ?? ""}`,
        `# Scopes: ${(gatewayIntegration.oauth.scopes ?? []).join(" ")}`,
      );
    }
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
          `# ${header.name} will be sent as "${header.valuePrefix} <value>"`,
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
  securitySchemes: Record<string, SecurityScheme>,
): string {
  const runtimeMode = getRuntimeMode(options);
  const gatewayIntegration = resolveMcpStackGatewayIntegration(options);
  const configuredHeaders = options.upstreamHeaders ?? [];
  const gatewayOauthSummary = formatGatewayOauthDescription(
    gatewayIntegration?.oauth ?? options.hostedOauthConfig,
  );
  const toolInstructionSummary = formatToolInstructionSummary(
    options.toolInstructions,
  );
  const hasPrompts = options.prompts && options.prompts.length > 0;
  const claudeToolCountNote = tools.length > 20
    ? `\n> Claude web currently works best with 20 or fewer tools per MCP server. This generated runtime exposes ${tools.length} tools; consider disabling or splitting tools before connecting it to Claude web.\n`
    : "";
  const promptSection = hasPrompts
    ? `
## Context Prompts

This runtime includes ${options.prompts!.length} pre-defined prompt(s):

${options.prompts!.map((prompt) => `- **${prompt.name}**: ${prompt.description}`).join("\n")}
`
    : "";

  if (isGatewayWorkerMode(runtimeMode)) {
    return `# ${options.name}

Gateway-enabled MCP runtime generated from an OpenAPI specification by [MCP Stack](https://mcpstack.com).
${promptSection}
${claudeToolCountNote}
## Runtime Shape

This runtime is meant to be used with MCP Stack Gateway as the public MCP and OAuth edge.

- MCP Stack Gateway owns the public MCP URL and OAuth flow
- Try this runtime yourself, or use MCP Stack Host if you want us to run it
- Gateway OAuth reference: ${gatewayOauthSummary}
- Tool instructions configured for: ${toolInstructionSummary}
- MCP clients should connect to MCP Stack Gateway, not directly to this runtime

## Quick Start

\`\`\`bash
npm install
npm run build
npm run start:http
\`\`\`

## Configuration

Copy \`.env.example\` to \`.env\` and configure:

- \`API_BASE_URL\`: Base URL of the downstream API
- \`PORT\`: HTTP port for the runtime
- \`MCP_PROTOCOL_VERSION\`: Stable MCP protocol version advertised by the runtime (defaults to \`2025-11-25\`)
- \`MCP_ALLOWED_ORIGINS\`: Comma-separated browser origins allowed to call the HTTP transport; server-to-server clients without an Origin header are allowed
- \`MCP_DRAFT_DISCOVERY_ENABLED\`: Optional draft \`server/discover\` handler, disabled by default
- \`MCPSTACK_WORKER_SHARED_SECRET\`: Shared secret MCP Stack uses to call the runtime

## Local Validation

1. Run the runtime with \`npm run start:http\`
2. Configure MCP Stack Gateway to use this runtime
3. Let MCP Stack Host and Gateway expose the public MCP server, OAuth flow, and client registration
4. Validate tool calls through MCP Stack
`;
  }

  const derivedSecuritySupport = Array.from(
    new Set(
      tools
        .flatMap((tool) => tool.securitySchemes)
        .map((schemeName) => {
          const scheme = securitySchemes[schemeName];
          if (scheme?.type === "apiKey") {
            return `${schemeName} (API key)`;
          }
          if (scheme?.type === "http" && scheme.scheme === "bearer") {
            return `${schemeName} (Bearer token)`;
          }
          return null;
        }),
    ),
  ).filter(Boolean);

  return `# ${options.name}

MCP server generated from an OpenAPI specification by [MCP Stack](https://mcpstack.com).
${promptSection}
${claudeToolCountNote}
## Runtime Shape

\`${runtimeMode}\`

${
  runtimeMode === "standalone_headers"
    ? `This server runs as a standalone MCP endpoint and injects static headers into upstream API calls.

- Configured headers: ${formatHeaderDescription(configuredHeaders)}
- OpenAPI header security schemes: ${derivedSecuritySupport.length > 0 ? derivedSecuritySupport.join(", ") : "none detected"}`
    : `This server runs as a standalone MCP endpoint with no built-in upstream authentication logic.`
}

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
- \`MCP_PROTOCOL_VERSION\`: Stable MCP protocol version advertised by the runtime (defaults to \`2025-11-25\`)
- \`MCP_ALLOWED_ORIGINS\`: Comma-separated browser origins allowed to call the HTTP transport; server-to-server clients without an Origin header are allowed
- \`MCP_DRAFT_DISCOVERY_ENABLED\`: Optional draft \`server/discover\` handler, disabled by default
${runtimeMode === "standalone_headers" ? "- Set the configured header env vars before starting the server" : ""}

## Client Usage

- HTTP clients: connect to \`http://localhost:3000/mcp\`
- Stdio clients: run \`npm start\`

## Notes

- This generator no longer produces standalone public OAuth resource servers.
- For user-scoped OAuth APIs generated from OpenAPI, use MCP Stack Gateway.
`;
}
