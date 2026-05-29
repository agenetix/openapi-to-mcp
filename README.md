# @mcpstack/openapi-to-mcp

Convert OpenAPI specifications into MCP servers.

Use this package when you want a quick way to turn an OpenAPI spec into a TypeScript MCP server.
If you want MCP Stack Gateway in front of that server, add `--use-mcpstack-gateway`.

[![npm version](https://badge.fury.io/js/%40emcy%2Fopenapi-to-mcp.svg)](https://www.npmjs.com/package/@mcpstack/openapi-to-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it generates

This package generates TypeScript MCP servers.

Most users only need two shapes:

1. `standalone_no_auth`
   - Public MCP server
   - No built-in upstream auth logic
   - Good for public or already-open APIs

2. `standalone_headers`
   - Public MCP server
   - Injects static/custom headers into every upstream API request
   - Good for API keys, static bearer tokens, tenant headers, and similar patterns

If you want MCP Stack Gateway in front of the generated server, opt into the Gateway integration:

- the generated server stays a TypeScript MCP server
- MCP Stack Gateway owns the public MCP and OAuth edge
- MCP Stack Host can run the server for you if you want managed hosting

FastMCP and other MCP runtimes can use MCP Stack Gateway too. This package is only for OpenAPI generation.

The generator no longer produces standalone public OAuth resource servers and no longer supports bearer-token passthrough.

## Quick Start

```bash
# Standalone MCP server for a public API
npx @mcpstack/openapi-to-mcp generate \
  --url https://petstore.swagger.io/v2/swagger.json \
  --mode standalone-no-auth

# Standalone MCP server that injects an API key header upstream
npx @mcpstack/openapi-to-mcp generate \
  --url ./openapi.yaml \
  --name my-api \
  --mode standalone-headers \
  --header X-API-Key=UPSTREAM_API_KEY

# Generate a server and configure it for MCP Stack Gateway on an OAuth-protected app
npx @mcpstack/openapi-to-mcp generate \
  --url ./openapi.yaml \
  --name my-app \
  --use-mcpstack-gateway \
  --gateway-provider sqlos \
  --gateway-auth-server-url https://auth.example.com/sqlos/auth \
  --gateway-client-id todo-mcp-local \
  --gateway-resource https://api.example.com/todos \
  --gateway-scopes "openid profile email offline_access todos.read todos.write"
```

## Installation

Use it directly with `npx` or install globally:

```bash
npm install -g @mcpstack/openapi-to-mcp
```

## Commands

### `generate`

```bash
npx @mcpstack/openapi-to-mcp generate [options]
```

| Option | Short | Description |
| --- | --- | --- |
| `--url` | `-u` | URL or file path to OpenAPI spec |
| `--name` | `-n` | Name for the generated server |
| `--output` | `-o` | Output directory |
| `--base-url` | `-b` | Override the upstream API base URL |
| `--version` |  | Runtime version string |
| `--mcpstack-telemetry` | `-e` | Include `@mcpstack/sdk` telemetry |
| `--local-sdk` |  | Use a local `@mcpstack/sdk` path |
| `--prompts-json` |  | JSON array of MCP prompt definitions |
| `--tool-instructions-json` |  | JSON object keyed by tool key for tool-specific AI guidance |
| `--mode` |  | Low-level runtime mode. Most users should only pass `standalone-no-auth` or `standalone-headers` directly |
| `--use-mcpstack-gateway` |  | Generate a server preconfigured to use MCP Stack Gateway as the public MCP/OAuth edge |
| `--header` |  | Repeatable `Header-Name=ENV_VAR` mapping for upstream requests |
| `--gateway-provider` |  | MCP Stack Gateway OAuth provider recipe label |
| `--gateway-auth-server-url` |  | Downstream authorization server issuer or metadata base URL |
| `--gateway-client-id` |  | Downstream client ID MCP Stack should use |
| `--gateway-resource` |  | Downstream API resource / audience |
| `--gateway-scopes` |  | Comma or space separated downstream scopes |
| `--force` | `-f` | Overwrite the output directory |

### `validate`

```bash
npx @mcpstack/openapi-to-mcp validate --url https://api.example.com/openapi.json
```

## Server Modes

### `standalone_no_auth`

Use this when the upstream API is public or already reachable without adding credentials from the MCP runtime.

```bash
npx @mcpstack/openapi-to-mcp generate \
  --url ./openapi.json \
  --mode standalone-no-auth
```

### `standalone_headers`

Use this when every upstream request needs static headers.

```bash
npx @mcpstack/openapi-to-mcp generate \
  --url ./openapi.json \
  --mode standalone-headers \
  --header X-API-Key=UPSTREAM_API_KEY \
  --header X-Tenant-Id=UPSTREAM_TENANT_ID
```

If your upstream API needs `Authorization: Bearer ...`, either:

- model it as a bearer security scheme in the OpenAPI document, or
- pass the full header value through an env var:

```bash
npx @mcpstack/openapi-to-mcp generate \
  --url ./openapi.json \
  --mode standalone-headers \
  --header Authorization=UPSTREAM_AUTHORIZATION
```

Then set:

```bash
UPSTREAM_AUTHORIZATION=Bearer eyJ...
```

## Using MCP Stack Gateway

Use this when the upstream API is protected by OAuth and you want MCP Stack Gateway to own the public MCP URL, OAuth flow, and client-facing discovery.

```bash
npx @mcpstack/openapi-to-mcp generate \
  --url ./openapi.json \
  --use-mcpstack-gateway \
  --gateway-provider sqlos \
  --gateway-auth-server-url https://auth.example.com/sqlos/auth \
  --gateway-client-id todo-mcp-local \
  --gateway-resource https://api.example.com/todos \
  --gateway-scopes "openid profile email offline_access todos.read todos.write"
```

This is the right mode for apps protected by systems like:

- Auth0
- WorkOS AuthKit
- SqlOS AuthServer/AuthPage
- Entra
- generic OAuth/OIDC authorization servers

Legacy compatibility:

- older `--mode mcpstack-gateway-worker` invocations still parse, but `--use-mcpstack-gateway` is the supported interface

Typical usage:

1. generate a normal MCP server
2. add `--use-mcpstack-gateway` when you want MCP Stack Gateway to become the public edge for that server

## Generated Server

Every generated server includes:

- TypeScript source
- MCP tool bindings for the selected OpenAPI operations
- Streamable HTTP transport
- `.env.example`
- generated README

Standalone modes also support stdio for desktop clients.

## Programmatic Usage

```ts
import { parseOpenAPI, mapToMcpTools, generateMcpServer } from "@mcpstack/openapi-to-mcp";

const parsed = await parseOpenAPI("https://api.example.com/openapi.json");
const tools = mapToMcpTools(parsed.endpoints);

const files = generateMcpServer(
  tools,
  {
    name: "my-api",
    version: "1.0.0",
    baseUrl: "https://api.example.com",
    runtimeMode: "standalone_headers",
    upstreamHeaders: [
      { name: "X-API-Key", envVar: "UPSTREAM_API_KEY" },
    ],
  },
  parsed.securitySchemes
);
```

Gateway-backed generation:

```ts
const files = generateMcpServer(
  tools,
  {
    name: "my-api",
    version: "1.0.0",
    baseUrl: "https://api.example.com",
    gatewayIntegration: {
      provider: "mcpstack",
      oauth: {
        provider: "sqlos",
        authorizationServerUrl: "https://auth.example.com/sqlos/auth",
        clientId: "todo-mcp-local",
        resource: "https://api.example.com/todos",
        scopes: ["openid", "profile", "todos.read", "todos.write"],
      },
    },
  },
  parsed.securitySchemes
);
```

## What this package does not do

- It does not host a public OAuth authorization server for MCP clients.
- It does not support forwarding end-user bearer tokens from the MCP client to the upstream API.
- It does not try to replace MCP Stack Host or MCP Stack Gateway for OAuth-protected apps.

## MCP Stack

Use MCP Stack when you want to turn an OAuth-protected API into:

- a hosted runtime behind MCP Stack Host
- a gateway-managed public MCP/OAuth surface
- an embedded agent
- a workspace integration
- an external client surface for tools like VS Code or Claude

The open-source generator handles the runtime. MCP Stack Host runs it. MCP Stack Gateway handles the public auth and orchestration layer.

## License

MIT © [MCP Stack](https://mcpstack.com)
