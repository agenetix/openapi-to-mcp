import { describe, expect, it } from "vitest";
import {
  normalizeRuntimeMode,
  parseEmcyGatewayIntegration,
  parseGatewayOauthConfig,
  parseGeneratorCliConfig,
  parseToolInstructions,
} from "../cli-config.js";

describe("cli-config", () => {
  it("normalizes supported runtime modes", () => {
    expect(normalizeRuntimeMode("standalone-no-auth")).toBe("standalone_no_auth");
    expect(normalizeRuntimeMode("standalone_headers")).toBe("standalone_headers");
    expect(normalizeRuntimeMode("emcy-gateway-worker")).toBe("emcy_gateway_worker");
  });

  it("parses gateway oauth config from explicit flags", () => {
    const config = parseGatewayOauthConfig({
      "gateway-provider": "auth0",
      "gateway-auth-server-url": "https://auth.example.com",
      "gateway-client-id": "client_123",
      "gateway-resource": "https://api.example.com",
      "gateway-scopes": "openid profile email offline_access todos.read",
    });

    expect(config).toEqual({
      provider: "auth0",
      authorizationServerUrl: "https://auth.example.com",
      clientId: "client_123",
      resource: "https://api.example.com",
      scopes: ["openid", "profile", "email", "offline_access", "todos.read"],
    });
  });

  it("parses tool instructions json objects", () => {
    expect(
      parseToolInstructions(
        JSON.stringify({
          get_api_todos: {
            customInstructions: "Use this for current todos only.",
          },
        })
      )
    ).toEqual({
      get_api_todos: {
        customInstructions: "Use this for current todos only.",
      },
    });
  });

  it("builds generator CLI config for gateway workers", () => {
    const parsed = parseGeneratorCliConfig({
      "use-emcy-gateway": true,
      "prompts-json": JSON.stringify([
        {
          name: "todo-summary",
          description: "Summarize todos",
          content: "Summarize {{topic}}",
        },
      ]),
      "tool-instructions-json": JSON.stringify({
        get_api_todos: {
          whenToUse: "When the user asks to list todos.",
        },
      }),
      "gateway-provider": "sqlos",
      "gateway-auth-server-url": "https://auth.example.com/sqlos/auth",
      "gateway-client-id": "todo-mcp-local",
      "gateway-resource": "https://api.example.com/todos",
      "gateway-scopes": "openid profile todos.read todos.write",
    });

    expect(parsed.runtimeMode).toBe("emcy_gateway_worker");
    expect(parsed.prompts).toHaveLength(1);
    expect(parsed.toolInstructions).toEqual({
      get_api_todos: {
        whenToUse: "When the user asks to list todos.",
      },
    });
    expect(parsed.gatewayOauthConfig).toEqual({
      provider: "sqlos",
      authorizationServerUrl: "https://auth.example.com/sqlos/auth",
      clientId: "todo-mcp-local",
      resource: "https://api.example.com/todos",
      scopes: ["openid", "profile", "todos.read", "todos.write"],
    });
    expect(parsed.gatewayIntegration).toEqual({
      provider: "emcy",
      oauth: {
        provider: "sqlos",
        authorizationServerUrl: "https://auth.example.com/sqlos/auth",
        clientId: "todo-mcp-local",
        resource: "https://api.example.com/todos",
        scopes: ["openid", "profile", "todos.read", "todos.write"],
      },
    });
  });

  it("parses emcy gateway integration from legacy runtime mode", () => {
    const integration = parseEmcyGatewayIntegration({
      mode: "emcy-gateway-worker",
      "gateway-auth-server-url": "https://auth.example.com",
    });

    expect(integration).toEqual({
      provider: "emcy",
      oauth: {
        authorizationServerUrl: "https://auth.example.com",
      },
    });
  });
});
