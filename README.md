# @emcy/openapi-to-mcp

Convert OpenAPI specifications into MCP runtimes.

[![npm version](https://badge.fury.io/js/%40emcy%2Fopenapi-to-mcp.svg)](https://www.npmjs.com/package/@emcy/openapi-to-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What it generates

This package now supports three runtime shapes only:

1. `standalone_no_auth`
   - Public MCP server
   - No built-in upstream auth logic
   - Good for public or already-open APIs

2. `standalone_headers`
   - Public MCP server
   - Injects static/custom headers into every upstream API request
   - Good for API keys, static bearer tokens, tenant headers, and similar patterns

3. `emcy_hosted_worker`
   - Private worker runtime behind Emcy
   - Emcy hosts the public MCP and OAuth surface
   - Good for OAuth-protected APIs where Emcy brokers user auth and forwards short-lived downstream access per execution

The generator no longer produces standalone public OAuth resource servers and no longer supports bearer-token passthrough.

## Quick Start

```bash
# Standalone MCP server for a public API
npx @emcy/openapi-to-mcp generate \
  --url https://petstore.swagger.io/v2/swagger.json \
  --mode standalone-no-auth

# Standalone MCP server that injects an API key header upstream
npx @emcy/openapi-to-mcp generate \
  --url ./openapi.yaml \
  --name my-api \
  --mode standalone-headers \
  --header X-API-Key=UPSTREAM_API_KEY

# Emcy-hosted worker for an OAuth-protected app
npx @emcy/openapi-to-mcp generate \
  --url ./openapi.yaml \
  --name my-app \
  --mode emcy-hosted-worker \
  --hosted-provider sqlos \
  --hosted-auth-server-url https://auth.example.com/sqlos/auth \
  --hosted-client-id todo-mcp-local \
  --hosted-resource https://api.example.com/todos \
  --hosted-scopes "openid profile email offline_access todos.read todos.write"
```

## Installation

Use it directly with `npx` or install globally:

```bash
npm install -g @emcy/openapi-to-mcp
```

## Commands

### `generate`

```bash
npx @emcy/openapi-to-mcp generate [options]
```

| Option | Short | Description |
| --- | --- | --- |
| `--url` | `-u` | URL or file path to OpenAPI spec |
| `--name` | `-n` | Name for the generated runtime |
| `--output` | `-o` | Output directory |
| `--base-url` | `-b` | Override the upstream API base URL |
| `--version` |  | Runtime version string |
| `--emcy` | `-e` | Include `@emcy/sdk` telemetry |
| `--local-sdk` |  | Use a local `@emcy/sdk` path |
| `--prompts-json` |  | JSON array of MCP prompt definitions |
| `--tool-instructions-json` |  | JSON object keyed by tool key for tool-specific AI guidance |
| `--mode` |  | `standalone-no-auth`, `standalone-headers`, or `emcy-hosted-worker` |
| `--header` |  | Repeatable `Header-Name=ENV_VAR` mapping for upstream requests |
| `--hosted-provider` |  | Hosted OAuth provider recipe label for `emcy-hosted-worker` |
| `--hosted-auth-server-url` |  | Downstream authorization server issuer or metadata base URL |
| `--hosted-client-id` |  | Downstream client ID Emcy should use |
| `--hosted-resource` |  | Downstream API resource / audience |
| `--hosted-scopes` |  | Comma or space separated downstream scopes |
| `--force` | `-f` | Overwrite the output directory |

### `validate`

```bash
npx @emcy/openapi-to-mcp validate --url https://api.example.com/openapi.json
```

## Runtime Modes

### `standalone_no_auth`

Use this when the upstream API is public or already reachable without adding credentials from the MCP runtime.

```bash
npx @emcy/openapi-to-mcp generate \
  --url ./openapi.json \
  --mode standalone-no-auth
```

### `standalone_headers`

Use this when every upstream request needs static headers.

```bash
npx @emcy/openapi-to-mcp generate \
  --url ./openapi.json \
  --mode standalone-headers \
  --header X-API-Key=UPSTREAM_API_KEY \
  --header X-Tenant-Id=UPSTREAM_TENANT_ID
```

If your upstream API needs `Authorization: Bearer ...`, either:

- model it as a bearer security scheme in the OpenAPI document, or
- pass the full header value through an env var:

```bash
npx @emcy/openapi-to-mcp generate \
  --url ./openapi.json \
  --mode standalone-headers \
  --header Authorization=UPSTREAM_AUTHORIZATION
```

Then set:

```bash
UPSTREAM_AUTHORIZATION=Bearer eyJ...
```

### `emcy_hosted_worker`

Use this when the upstream API is protected by OAuth and you want Emcy to host the MCP and OAuth surface.

The generated runtime is not the public MCP server. It is the private worker Emcy calls after it has already:

- authenticated the MCP client
- completed the downstream app OAuth flow
- stored the downstream grant server-side
- minted or loaded the short-lived downstream access token for the execution

```bash
npx @emcy/openapi-to-mcp generate \
  --url ./openapi.json \
  --mode emcy-hosted-worker \
  --hosted-provider sqlos \
  --hosted-auth-server-url https://auth.example.com/sqlos/auth \
  --hosted-client-id todo-mcp-local \
  --hosted-resource https://api.example.com/todos \
  --hosted-scopes "openid profile email offline_access todos.read todos.write"
```

This is the right mode for apps protected by systems like:

- Auth0
- WorkOS AuthKit
- SqlOS AuthServer/AuthPage
- Entra
- generic OAuth/OIDC authorization servers

## Generated Runtime

Every generated runtime includes:

- TypeScript source
- MCP tool bindings for the selected OpenAPI operations
- Streamable HTTP transport
- `.env.example`
- generated README

Standalone modes also support stdio for desktop clients.

## Programmatic Usage

```ts
import { parseOpenAPI, mapToMcpTools, generateMcpServer } from "@emcy/openapi-to-mcp";

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

## What this package does not do

- It does not host a public OAuth authorization server for MCP clients.
- It does not support forwarding end-user bearer tokens from the MCP client to the upstream API.
- It does not try to replace Emcy's hosted auth/runtime layer for OAuth-protected apps.

## Emcy

Use Emcy when you want to turn an OAuth-protected API into:

- a hosted MCP server
- an embedded agent
- a workspace integration
- an external client surface for tools like VS Code or Claude

The open-source generator handles the runtime. Emcy handles the hosted auth and orchestration layer.

## License

MIT © [Emcy](https://emcy.ai)
