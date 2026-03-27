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
    expect(serverCode).toContain('const RUNTIME_MODE = "standalone_no_auth" as const;');
    expect(serverCode).not.toContain("HOSTED_WORKER_CONFIG");
    expect(transportCode).toContain('public_server: true');
    expect(transportCode).not.toContain("protected-resource-metadata");
    expect(envExample).toContain("API_BASE_URL=http://localhost:3000");
    expect(envExample).not.toContain("FORWARD_CLIENT_TOKEN");
    expect(envExample).not.toContain("OAUTH_AUTHORIZATION_SERVER");
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

    expect(serverCode).toContain('const RUNTIME_MODE = "standalone_headers" as const;');
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

  it("generates Emcy hosted workers without public OAuth behavior", () => {
    const files = generateMcpServer([], {
      ...baseOptions,
      runtimeMode: "emcy_hosted_worker",
      hostedWorkerConfig: {},
    });

    const pkg = JSON.parse(files["package.json"]);
    const serverCode = files["src/index.ts"];
    const transportCode = files["src/transport.ts"];
    const envExample = files[".env.example"];
    const readme = files["README.md"];

    expect(pkg.scripts.start).toBe("node build/index.js --transport=streamable-http");
    expect(serverCode).toContain('const RUNTIME_MODE = "emcy_hosted_worker" as const;');
    expect(serverCode).toContain("const HOSTED_WORKER_CONFIG = {");
    expect(serverCode).toContain("applyHostedWorkerAccessToken");
    expect(transportCode).toContain('app.use("/mcp", async (c, next) => {');
    expect(transportCode).toContain("x-emcy-worker-secret");
    expect(transportCode).toContain("x-emcy-upstream-access-token");
    expect(transportCode).not.toContain("protected-resource-metadata");
    expect(envExample).toContain("EMCY_WORKER_SHARED_SECRET=change-me");
    expect(readme).toContain("Hosted worker runtime");
    expect(readme).toContain("Emcy owns the public MCP URL and OAuth flow");
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
    expect(serverCode).toContain('["getUsers"');
    expect(serverCode).toContain('["createUser"');
    expect(serverCode).toContain('requestBodyContentType: "application/json"');
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
