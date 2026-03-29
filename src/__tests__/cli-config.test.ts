import { describe, expect, it } from "vitest";
import {
  normalizeRuntimeMode,
  parseGeneratorCliConfig,
  parseHostedOauthConfig,
  parseToolInstructions,
} from "../cli-config.js";

describe("cli-config", () => {
  it("normalizes supported runtime modes", () => {
    expect(normalizeRuntimeMode("standalone-no-auth")).toBe("standalone_no_auth");
    expect(normalizeRuntimeMode("standalone_headers")).toBe("standalone_headers");
    expect(normalizeRuntimeMode("emcy-hosted-worker")).toBe("emcy_hosted_worker");
  });

  it("parses hosted oauth config from explicit flags", () => {
    const config = parseHostedOauthConfig({
      "hosted-provider": "auth0",
      "hosted-auth-server-url": "https://auth.example.com",
      "hosted-client-id": "client_123",
      "hosted-resource": "https://api.example.com",
      "hosted-scopes": "openid profile email offline_access todos.read",
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

  it("builds generator CLI config for hosted workers", () => {
    const parsed = parseGeneratorCliConfig({
      mode: "emcy-hosted-worker",
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
      "hosted-provider": "sqlos",
      "hosted-auth-server-url": "https://auth.example.com/sqlos/auth",
      "hosted-client-id": "todo-mcp-local",
      "hosted-resource": "https://api.example.com/todos",
      "hosted-scopes": "openid profile todos.read todos.write",
    });

    expect(parsed.runtimeMode).toBe("emcy_hosted_worker");
    expect(parsed.prompts).toHaveLength(1);
    expect(parsed.toolInstructions).toEqual({
      get_api_todos: {
        whenToUse: "When the user asks to list todos.",
      },
    });
    expect(parsed.hostedOauthConfig).toEqual({
      provider: "sqlos",
      authorizationServerUrl: "https://auth.example.com/sqlos/auth",
      clientId: "todo-mcp-local",
      resource: "https://api.example.com/todos",
      scopes: ["openid", "profile", "todos.read", "todos.write"],
    });
  });
});
