/**
 * Generator tests - verifies the supported runtime modes.
 */

import { describe, expect, it } from "vitest";
import { generateMcpServer } from "../generator.js";
import type { GeneratorOptions, McpToolDefinition } from "../types.js";

describe("generateMcpServer", () => {
  const baseOptions: GeneratorOptions = {
    name: "test-api",
    version: "1.0.0",
    baseUrl: "http://localhost:3000",
  };

  const sampleTool: McpToolDefinition = {
    name: "getUsers",
    description: "Get all users",
    inputSchema: { type: "object", properties: {} },
    httpMethod: "get",
    pathTemplate: "/users",
    parameters: [],
    securitySchemes: [],
    requiredScopes: [],
  };

  it("generates the expected file set", () => {
    const files = generateMcpServer([], baseOptions);

    expect(Object.keys(files)).toEqual([
      "package.json",
      "tsconfig.json",
      "src/index.ts",
      "src/transport.ts",
      ".env.example",
      "README.md",
    ]);
  });

  it("includes Emcy telemetry when emcyEnabled is true", () => {
    const files = generateMcpServer([], { ...baseOptions, emcyEnabled: true });
    const pkg = JSON.parse(files["package.json"]);
    const serverCode = files["src/index.ts"];

    expect(pkg.dependencies["@emcy/sdk"]).toBeDefined();
    expect(serverCode).toContain('import { EmcyTelemetry } from "@emcy/sdk"');
    expect(serverCode).toContain("emcy.trace(");
  });

  it("uses a local SDK path when provided", () => {
    const files = generateMcpServer([], {
      ...baseOptions,
      emcyEnabled: true,
      localSdkPath: "../emcy-sdk",
    });
    const pkg = JSON.parse(files["package.json"]);

    expect(pkg.dependencies["@emcy/sdk"]).toBe("file:../emcy-sdk");
  });

  it("generates standalone no-auth runtimes by default", () => {
    const files = generateMcpServer([sampleTool], baseOptions);
    const pkg = JSON.parse(files["package.json"]);
    const serverCode = files["src/index.ts"];
    const transportCode = files["src/transport.ts"];
    const envExample = files[".env.example"];

    expect(pkg.scripts.start).toBe("node build/index.js");
    expect(pkg.dependencies.jose).toBeUndefined();
    expect(serverCode).toContain('type RuntimeMode = "standalone_no_auth" | "standalone_headers" | "emcy_gateway_worker";');
    expect(serverCode).toContain('const RUNTIME_MODE: RuntimeMode = "standalone_no_auth";');
    expect(serverCode).not.toContain("GATEWAY_WORKER_CONFIG");
    expect(transportCode).toContain('public_server: true');
    expect(transportCode).not.toContain("protected-resource-metadata");
    expect(envExample).toContain("API_BASE_URL=http://localhost:3000");
    expect(envExample).not.toContain("FORWARD_CLIENT_TOKEN");
    expect(envExample).not.toContain("OAUTH_AUTHORIZATION_SERVER");
  });

  it("hardens generated HTTP transport for hosted-client compatibility without disabling stable sessions", () => {
    const files = generateMcpServer([sampleTool], baseOptions);
    const transportCode = files["src/transport.ts"];
    const envExample = files[".env.example"];
    const readme = files["README.md"];

    expect(transportCode).toContain('const DEFAULT_MCP_PROTOCOL_VERSION = process.env.MCP_PROTOCOL_VERSION || "2025-11-25";');
    expect(transportCode).toContain('"MCP-Protocol-Version"');
    expect(transportCode).toContain('"Mcp-Method"');
    expect(transportCode).toContain('"Mcp-Name"');
    expect(transportCode).toContain('"Mcp-Param-*"');
    expect(transportCode).toContain("function isOriginAllowed");
    expect(transportCode).toContain('error: "origin_not_allowed"');
    expect(transportCode).toContain("JSON-RPC batch requests are not supported by this MCP runtime.");
    expect(transportCode).toContain('process.env.MCP_DRAFT_DISCOVERY_ENABLED === "true"');
    expect(transportCode).toContain('getJsonRpcMethod(payload) === "server/discover"');
    expect(transportCode).toContain("new WebStandardStreamableHTTPServerTransport");
    expect(transportCode).toContain("sessionIdGenerator");
    expect(envExample).toContain("# MCP_PROTOCOL_VERSION=2025-11-25");
    expect(envExample).toContain("# MCP_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000");
    expect(envExample).toContain("# MCP_DRAFT_DISCOVERY_ENABLED=false");
    expect(readme).toContain("MCP_DRAFT_DISCOVERY_ENABLED");
  });

  it("returns generated tools in deterministic name order", () => {
    const files = generateMcpServer(
      [
        { ...sampleTool, name: "zeta_tool" },
        { ...sampleTool, name: "alpha_tool" },
      ],
      baseOptions
    );

    const serverCode = files["src/index.ts"];
    expect(serverCode).toContain(".sort((left, right) => left.name.localeCompare(right.name))");
  });

  it("registers legacy tool aliases without exposing duplicate tools", () => {
    const files = generateMcpServer(
      [
        {
          ...sampleTool,
          name: "rename_checklist",
          aliases: ["patch_api_checklists_by_id"],
        },
      ],
      baseOptions
    );

    const serverCode = files["src/index.ts"];
    expect(serverCode).toContain('name: "rename_checklist"');
    expect(serverCode).toContain('aliases: ["patch_api_checklists_by_id"]');
    expect(serverCode).toContain("toolDefinitionMap.set(alias, toolDefinition)");
    expect(serverCode).toContain("const toolsForClient: Tool[] = toolDefinitions");
    expect(serverCode).not.toContain("Array.from(toolDefinitionMap.values())");
  });

  it("emits a Claude web readiness warning when generated tool count exceeds 20", () => {
    const manyTools = Array.from({ length: 21 }, (_, index) => ({
      ...sampleTool,
      name: `tool_${index}`,
      pathTemplate: `/tools/${index}`,
    }));

    const files = generateMcpServer(manyTools, baseOptions);
    const transportCode = files["src/transport.ts"];
    const readme = files["README.md"];

    expect(transportCode).toContain("const GENERATED_TOOL_COUNT = 21;");
    expect(transportCode).toContain('status: GENERATED_TOOL_COUNT > CLAUDE_WEB_RECOMMENDED_TOOL_LIMIT ? "too_many_tools" : "ok"');
    expect(readme).toContain("Claude web currently works best with 20 or fewer tools");
    expect(readme).toContain("This generated runtime exposes 21 tools");
  });

  it("folds tool instructions into generated tool descriptions", () => {
    const files = generateMcpServer([sampleTool], {
      ...baseOptions,
      toolInstructions: {
        getUsers: {
          whenToUse: "Use when the user asks to list users.",
          whenNotToUse: "Do not use for creating users.",
        },
      },
    });

    const serverCode = files["src/index.ts"];

    expect(serverCode).toContain("AI usage guidance:");
    expect(serverCode).toContain("When to use: Use when the user asks to list users.");
    expect(serverCode).toContain("When not to use: Do not use for creating users.");
  });

  it("generates standalone header injection runtimes", () => {
    const files = generateMcpServer(
      [
        {
          ...sampleTool,
          securitySchemes: ["bearerAuth"],
        },
      ],
      {
        ...baseOptions,
        runtimeMode: "standalone_headers",
        upstreamHeaders: [
          {
            name: "X-API-Key",
            envVar: "UPSTREAM_API_KEY",
          },
          {
            name: "Authorization",
            envVar: "UPSTREAM_TOKEN",
            valuePrefix: "Bearer",
          },
        ],
      },
      {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      }
    );

    const serverCode = files["src/index.ts"];
    const envExample = files[".env.example"];
    const readme = files["README.md"];

    expect(serverCode).toContain('type RuntimeMode = "standalone_no_auth" | "standalone_headers" | "emcy_gateway_worker";');
    expect(serverCode).toContain('const RUNTIME_MODE: RuntimeMode = "standalone_headers";');
    expect(serverCode).toContain('"envVar": "UPSTREAM_API_KEY"');
    expect(serverCode).toContain('"envVar": "UPSTREAM_TOKEN"');
    expect(serverCode).toContain('if (RUNTIME_MODE !== "standalone_headers")');
    expect(serverCode).toContain("applyConfiguredUpstreamHeaders(headers)");
    expect(envExample).toContain("UPSTREAM_API_KEY=");
    expect(envExample).toContain("UPSTREAM_TOKEN=");
    expect(envExample).toContain("BEARER_TOKEN_BEARERAUTH=");
    expect(readme).toContain("standalone_headers");
    expect(readme).toContain("injects static headers");
    expect(envExample).not.toContain("FORWARD_CLIENT_TOKEN");
  });

  it("generates Emcy gateway workers without public OAuth behavior", () => {
    const files = generateMcpServer([], {
      ...baseOptions,
      gatewayIntegration: {
        provider: "emcy",
        worker: {},
        oauth: {
          provider: "sqlos",
          authorizationServerUrl: "https://auth.example.com/sqlos/auth",
          clientId: "todo-mcp-local",
          resource: "https://api.example.com/todos",
          scopes: ["openid", "profile", "todos.read", "todos.write"],
        },
      },
      toolInstructions: {
        get_api_todos: {
          whenToUse: "Use when the user asks to list todos.",
        },
      },
    });

    const pkg = JSON.parse(files["package.json"]);
    const serverCode = files["src/index.ts"];
    const transportCode = files["src/transport.ts"];
    const envExample = files[".env.example"];
    const readme = files["README.md"];

    expect(pkg.scripts.start).toBe("node build/index.js --transport=streamable-http");
    expect(serverCode).toContain('type RuntimeMode = "standalone_no_auth" | "standalone_headers" | "emcy_gateway_worker";');
    expect(serverCode).toContain('const RUNTIME_MODE: RuntimeMode = "emcy_gateway_worker";');
    expect(serverCode).toContain("const GATEWAY_WORKER_CONFIG = {");
    expect(serverCode).toContain("const GATEWAY_OAUTH_CONFIG: RuntimeGatewayOauthConfig | null = {");
    expect(serverCode).toContain("const TOOL_INSTRUCTIONS: Record<string, RuntimeToolInstruction> = {");
    expect(serverCode).toContain("applyGatewayWorkerAccessToken");
    expect(transportCode).toContain('app.use("/mcp", async (c, next) => {');
    expect(transportCode).toContain('process.env.EMCY_ALLOW_DIRECT_MCP_CLIENTS === "true"');
    expect(transportCode).toContain("x-emcy-worker-secret");
    expect(transportCode).toContain("x-emcy-upstream-access-token");
    expect(transportCode).not.toContain("protected-resource-metadata");
    expect(envExample).toContain("EMCY_WORKER_SHARED_SECRET=change-me");
    expect(envExample).toContain("# Authorization server: https://auth.example.com/sqlos/auth");
    expect(readme).toContain("Gateway-enabled MCP runtime generated from an OpenAPI specification by [Emcy](https://emcy.ai).");
    expect(readme).toContain("This runtime is meant to be used with Emcy Gateway as the public MCP and OAuth edge.");
    expect(readme).toContain("Gateway OAuth reference: sqlos");
    expect(readme).toContain("Tool instructions configured for: get_api_todos");
  });

  it("does not emit invalid const assertions for empty hosted config", () => {
    const files = generateMcpServer([], {
      ...baseOptions,
      gatewayIntegration: {
        provider: "emcy",
        worker: {},
      },
    });

    const serverCode = files["src/index.ts"];

    expect(serverCode).toContain(
      "const GATEWAY_OAUTH_CONFIG: RuntimeGatewayOauthConfig | null = null;"
    );
    expect(serverCode).toContain(
      "const TOOL_INSTRUCTIONS: Record<string, RuntimeToolInstruction> = {};"
    );
    expect(serverCode).not.toContain("null as const");
    expect(serverCode).not.toContain("{} as const");
  });

  it("keeps generated tool definitions in the runtime", () => {
    const files = generateMcpServer(
      [
        sampleTool,
        {
          name: "createUser",
          description: "Create a user",
          inputSchema: {
            type: "object",
            properties: { requestBody: { type: "object" } },
            required: ["requestBody"],
          },
          httpMethod: "post",
          pathTemplate: "/users",
          parameters: [],
          requestBodyContentType: "application/json",
          securitySchemes: [],
          requiredScopes: [],
        },
      ],
      baseOptions
    );

    const serverCode = files["src/index.ts"];
    expect(serverCode).toContain('name: "getUsers"');
    expect(serverCode).toContain('name: "createUser"');
    expect(serverCode).toContain('requestBodyContentType: "application/json"');
  });

  it("types generated OpenAPI parameters with optional schemas", () => {
    const files = generateMcpServer(
      [
        {
          ...sampleTool,
          name: "getUser",
          pathTemplate: "/users/{id}",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "User id",
              schema: { type: "string", format: "uuid" },
            },
          ],
        },
      ],
      baseOptions
    );

    const serverCode = files["src/index.ts"];
    expect(serverCode).toContain("description?: string;");
    expect(serverCode).toContain("schema?: Record<string, unknown>;");
    expect(serverCode).toContain('"schema":{"type":"string","format":"uuid"}');
  });

  it("generates prompt handlers when prompts are configured", () => {
    const files = generateMcpServer([], {
      ...baseOptions,
      prompts: [
        {
          name: "summarize-users",
          description: "Summarize users",
          content: "Summarize {{topic}}",
          arguments: [
            {
              name: "topic",
              description: "Topic to summarize",
              required: true,
            },
          ],
        },
      ],
    });

    const serverCode = files["src/index.ts"];
    expect(serverCode).toContain("ListPromptsRequestSchema");
    expect(serverCode).toContain("GetPromptRequestSchema");
    expect(serverCode).toContain("promptDefinitionMap");
  });
});
