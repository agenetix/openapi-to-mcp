# @emcy/openapi-to-mcp

Convert OpenAPI specifications to MCP (Model Context Protocol) servers in seconds.

[![npm version](https://badge.fury.io/js/%40emcy%2Fopenapi-to-mcp.svg)](https://www.npmjs.com/package/@emcy/openapi-to-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What is this?

This CLI tool takes an OpenAPI specification (Swagger) and generates a fully functional MCP server that exposes your API endpoints as AI-callable tools.

**Use cases:**
- Let AI assistants (Claude, Cursor, etc.) interact with your REST APIs
- Create MCP servers without writing code
- Add observability to AI tool usage with Emcy telemetry

## Quick Start

```bash
# Generate from a URL
npx @emcy/openapi-to-mcp generate --url https://petstore.swagger.io/v2/swagger.json

# Generate from a local file
npx @emcy/openapi-to-mcp generate --url ./openapi.yaml --name my-api

# Generate with Emcy telemetry enabled
npx @emcy/openapi-to-mcp generate --url ./api.json --name my-api --emcy
```

## Todo OAuth Sample

The canonical end-to-end OAuth sample for Emcy is the SqlOS Todo app:

1. Generate the MCP server from the Todo OpenAPI spec.
2. Set `OAUTH_AUTHORIZATION_SERVER` to the SqlOS auth server issuer or metadata URL.
3. Set `MCP_RESOURCE_URL` to the public HTTPS URL of the generated MCP server.
4. Set `FORWARD_CLIENT_TOKEN=true` so user bearer tokens flow through to the upstream Todo API.
5. Deploy the generated server and verify:
   - `/.well-known/oauth-protected-resource` returns the Todo resource metadata
   - `WWW-Authenticate` includes `resource_metadata="..."`
   - tokens with the wrong `aud` are rejected

Example environment:

```bash
OAUTH_AUTHORIZATION_SERVER=https://auth.todo.example.com
MCP_RESOURCE_URL=https://todo-mcp.example.com
FORWARD_CLIENT_TOKEN=true
```

## Installation

You can use it directly with `npx` (recommended) or install globally:

```bash
npm install -g @emcy/openapi-to-mcp
```

## Commands

### `generate`

Generate an MCP server from an OpenAPI specification.

```bash
npx @emcy/openapi-to-mcp generate [options]
```

**Options:**

| Option | Short | Description |
|--------|-------|-------------|
| `--url` | `-u` | URL or file path to OpenAPI specification (required) |
| `--name` | `-n` | Name for the generated MCP server |
| `--output` | `-o` | Output directory (default: `./<name>-mcp-server`) |
| `--emcy` | `-e` | Enable Emcy telemetry integration |
| `--base-url` | `-b` | Override base URL for API calls |
| `--version` | | Version string for the server |
| `--force` | `-f` | Overwrite existing output directory |

### `validate`

Validate an OpenAPI specification.

```bash
npx @emcy/openapi-to-mcp validate --url https://api.example.com/openapi.json
```

## Generated Server

The generated MCP server includes:

- **TypeScript source code** - Full type safety
- **HTTP transport** - For Cursor and web-based clients
- **Stdio transport** - For Claude Desktop
- **Security support** - API keys, Bearer tokens, OAuth2
- **Environment-based config** - `.env.example` with all settings
- **README** - Usage instructions

### Running the Generated Server

```bash
cd my-api-mcp-server
npm install
npm run build

# For Cursor/HTTP clients
npm run start:http

# For Claude Desktop/stdio
npm start
```

When OAuth is enabled, always set `MCP_RESOURCE_URL` to the final public URL of the MCP server. The generated server uses that value for RFC 8707 audience validation and for the RFC 9728 protected-resource metadata document.

### Using with Cursor

Add to your `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "my-api": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Using with Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["/path/to/my-api-mcp-server/build/index.js"]
    }
  }
}
```

## Emcy Telemetry

When you generate with `--emcy`, the server includes [@emcy/sdk](https://www.npmjs.com/package/@emcy/sdk) for telemetry:

- **Tool invocation tracking** - Every tool call is logged
- **Error monitoring** - Failures are captured with context
- **Performance metrics** - Latency and success rates
- **Dashboard** - View analytics at [emcy.ai](https://emcy.ai)

To enable telemetry, set these environment variables:

```bash
EMCY_API_KEY=your-api-key-from-dashboard
EMCY_TELEMETRY_URL=https://api.emcy.ai/v1/telemetry
EMCY_MCP_SERVER_ID=mcp_xxxxxxxxxxxx
```

## Programmatic Usage

You can also use the library programmatically:

```typescript
import { parseOpenAPI, mapToMcpTools, generateMcpServer } from '@emcy/openapi-to-mcp';

// Parse an OpenAPI spec
const parsed = await parseOpenAPI('https://api.example.com/openapi.json');

// Map endpoints to MCP tools
const tools = mapToMcpTools(parsed.endpoints);

// Generate server files
const files = generateMcpServer(tools, {
  name: 'my-api',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
  emcyEnabled: true,
}, parsed.securitySchemes);

// files is a Record<string, string> of file paths to contents
```

## Supported OpenAPI Features

- ✅ OpenAPI 3.0 and 3.1
- ✅ Path, query, and header parameters
- ✅ Request bodies (JSON)
- ✅ API key authentication
- ✅ Bearer token authentication
- ✅ OAuth2 (client credentials)
- ✅ Multiple security schemes
- ⏳ File uploads (coming soon)
- ⏳ Webhooks (coming soon)

## Examples

### Petstore API

```bash
npx @emcy/openapi-to-mcp generate \
  --url https://petstore.swagger.io/v2/swagger.json \
  --name petstore
```

### Local Development API

```bash
npx @emcy/openapi-to-mcp generate \
  --url http://localhost:5000/swagger/v1/swagger.json \
  --name my-local-api \
  --base-url http://localhost:5000
```

### With Emcy Telemetry

```bash
npx @emcy/openapi-to-mcp generate \
  --url ./openapi.yaml \
  --name my-api \
  --emcy \
  --output ./mcp-servers/my-api
```

## License

MIT © [Emcy](https://emcy.ai)

