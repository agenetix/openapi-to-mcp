#!/usr/bin/env node
/**
 * @emcy/openapi-to-mcp CLI
 * 
 * Convert OpenAPI specifications to MCP servers with optional Emcy telemetry.
 * 
 * Usage:
 *   npx @emcy/openapi-to-mcp generate --url https://api.example.com/openapi.json
 *   npx @emcy/openapi-to-mcp generate --url ./openapi.yaml --name my-api --emcy
 */

import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

import { parseOpenAPI, validateOpenAPI } from './parser.js';
import { mapToMcpTools } from './mapper.js';
import { generateMcpServer } from './generator.js';
import {
  parseGeneratorCliConfig,
  pickGeneratorOptions,
} from './cli-config.js';

const VERSION = '0.1.0';

const HELP = `
@emcy/openapi-to-mcp - Convert OpenAPI specs to MCP servers

USAGE:
  npx @emcy/openapi-to-mcp <command> [options]

COMMANDS:
  generate    Generate an MCP server from an OpenAPI specification
  validate    Validate an OpenAPI specification
  help        Show this help message

GENERATE OPTIONS:
  --url, -u       URL or file path to OpenAPI specification (required)
  --name, -n      Name for the generated MCP server (default: from spec title)
  --output, -o    Output directory (default: ./<name>-mcp-server)
 --emcy, -e      Enable Emcy telemetry integration
  --base-url, -b  Override base URL for API calls
  --version       Version string for the server (default: from spec)
  --force, -f     Overwrite existing output directory
  --local-sdk     Path to local @emcy/sdk for development (uses file: reference)
  --prompts-json  JSON array of prompt definitions for MCP prompts feature
  --tool-instructions-json  JSON object keyed by tool key for tool-specific guidance
  --mode          Runtime mode:
                  standalone-no-auth | standalone-headers | emcy-hosted-worker
  --header        Upstream header mapping in the form Header-Name=ENV_VAR
                  Repeatable. Applies to standalone-headers and emcy-hosted-worker.
  --hosted-provider        Hosted OAuth provider recipe label
  --hosted-auth-server-url Hosted OAuth issuer or metadata base URL
  --hosted-client-id       Downstream client ID Emcy should use
  --hosted-resource        Downstream API resource / audience
  --hosted-scopes          Comma or space separated downstream scopes

EXAMPLES:
  # Generate from a URL
  npx @emcy/openapi-to-mcp generate --url https://petstore.swagger.io/v2/swagger.json

  # Generate from a local file with Emcy telemetry
  npx @emcy/openapi-to-mcp generate --url ./openapi.yaml --name my-api --emcy

  # Generate with custom output directory
  npx @emcy/openapi-to-mcp generate --url ./api.json -o ./my-mcp-server

  # Generate a standalone MCP server that injects API key headers upstream
  npx @emcy/openapi-to-mcp generate --url ./api.json --mode standalone-headers --header X-API-Key=UPSTREAM_API_KEY

  # Generate an Emcy-hosted worker for OAuth-protected apps
  npx @emcy/openapi-to-mcp generate --url ./api.json --mode emcy-hosted-worker \\
    --hosted-provider sqlos \\
    --hosted-auth-server-url https://auth.example.com/sqlos/auth \\
    --hosted-client-id todo-mcp-local \\
    --hosted-resource https://api.example.com/todos \\
    --hosted-scopes "openid profile email offline_access todos.read todos.write"

  # Validate an OpenAPI spec
  npx @emcy/openapi-to-mcp validate --url https://api.example.com/openapi.json
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(`@emcy/openapi-to-mcp v${VERSION}`);
    process.exit(0);
  }

  if (command === 'validate') {
    await runValidate(args.slice(1));
  } else if (command === 'generate') {
    await runGenerate(args.slice(1));
  } else {
    console.error(`Unknown command: ${command}`);
    console.log('Run with --help for usage information.');
    process.exit(1);
  }
}

async function runValidate(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: 'string', short: 'u' },
    },
    allowPositionals: false,
  });

  if (!values.url) {
    console.error('Error: --url is required');
    process.exit(1);
  }

  console.log(`Validating: ${values.url}`);

  try {
    const input = await loadSpec(values.url);
    const result = await validateOpenAPI(input);

    if (result.valid) {
      console.log('✓ OpenAPI specification is valid');
      process.exit(0);
    } else {
      console.error('✗ OpenAPI specification is invalid:');
      for (const error of result.errors || []) {
        console.error(`  - ${error}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('Error validating spec:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function runGenerate(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: 'string', short: 'u' },
      name: { type: 'string', short: 'n' },
      output: { type: 'string', short: 'o' },
      emcy: { type: 'boolean', short: 'e', default: false },
      'base-url': { type: 'string', short: 'b' },
      version: { type: 'string' },
      force: { type: 'boolean', short: 'f', default: false },
      'local-sdk': { type: 'string' },  // Path to local @emcy/sdk for dev
      'prompts-json': { type: 'string' },  // JSON array of prompt definitions
      'tool-instructions-json': { type: 'string' },
      mode: { type: 'string' },
      header: { type: 'string', multiple: true },
      'hosted-provider': { type: 'string' },
      'hosted-auth-server-url': { type: 'string' },
      'hosted-client-id': { type: 'string' },
      'hosted-resource': { type: 'string' },
      'hosted-scopes': { type: 'string' },
    },
    allowPositionals: false,
  });

  if (!values.url) {
    console.error('Error: --url is required');
    console.log('Usage: npx @emcy/openapi-to-mcp generate --url <openapi-url-or-path>');
    process.exit(1);
  }

  console.log(`\n🔧 @emcy/openapi-to-mcp Generator\n`);
  console.log(`Loading OpenAPI spec from: ${values.url}`);

  try {
    // Load and parse the spec
    const input = await loadSpec(values.url);
    const parsed = await parseOpenAPI(input);

    console.log(`  Title: ${parsed.title}`);
    console.log(`  Version: ${parsed.version}`);
    console.log(`  Endpoints: ${parsed.endpoints.length}`);
    console.log(`  Base URL: ${parsed.baseUrl || '(not specified)'}`);

    // Map to MCP tools
    const tools = mapToMcpTools(parsed.endpoints);
    console.log(`  Tools: ${tools.length}`);

    // Determine output settings
    const serverName = values.name || slugify(parsed.title);
    const outputDir = values.output || `./${serverName}-mcp-server`;
    const resolvedOutput = resolve(outputDir);

    // Check if output exists
    if (existsSync(resolvedOutput) && !values.force) {
      console.error(`\nError: Output directory already exists: ${resolvedOutput}`);
      console.error('Use --force to overwrite.');
      process.exit(1);
    }

    let parsedConfig;
    try {
      parsedConfig = parseGeneratorCliConfig(values);
    } catch (error) {
      console.error('Error parsing generator options:', error instanceof Error ? error.message : error);
      process.exit(1);
    }

    console.log(`\nGenerating MCP server: ${serverName}`);
    console.log(`  Output: ${resolvedOutput}`);
    console.log(`  Emcy Telemetry: ${values.emcy ? 'enabled' : 'disabled'}`);
    console.log(`  Runtime Mode: ${parsedConfig.runtimeMode}`);
    if (values['local-sdk']) {
      console.log(`  Local SDK: ${values['local-sdk']}`);
    }
    if (parsedConfig.prompts && parsedConfig.prompts.length > 0) {
      console.log(`  Prompts: ${parsedConfig.prompts.length} prompt(s) configured`);
    }
    if (parsedConfig.upstreamHeaders.length > 0) {
      console.log(`  Upstream Headers: ${parsedConfig.upstreamHeaders.map((header) => `${header.name}<- ${header.envVar}`).join(', ')}`);
    }
    if (parsedConfig.toolInstructions) {
      console.log(`  Tool Instructions: ${Object.keys(parsedConfig.toolInstructions).length} tool(s) customized`);
    }
    if (parsedConfig.hostedOauthConfig) {
      console.log(`  Hosted OAuth: ${parsedConfig.hostedOauthConfig.provider || 'manual'}${parsedConfig.hostedOauthConfig.authorizationServerUrl ? ` via ${parsedConfig.hostedOauthConfig.authorizationServerUrl}` : ''}`);
    }

    // Generate the server
    const files = generateMcpServer(
      tools,
      pickGeneratorOptions(
        {
          name: serverName,
          version: values.version || parsed.version || '1.0.0',
          baseUrl: values['base-url'] || parsed.baseUrl || 'http://localhost:3000',
          emcyEnabled: values.emcy || false,
          localSdkPath: values['local-sdk'],
        },
        parsedConfig
      ),
      parsed.securitySchemes
    );

    // Write files
    await mkdir(resolvedOutput, { recursive: true });
    await mkdir(join(resolvedOutput, 'src'), { recursive: true });

    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(resolvedOutput, filePath);
      const dir = join(resolvedOutput, filePath.split('/').slice(0, -1).join('/'));
      
      if (dir !== resolvedOutput) {
        await mkdir(dir, { recursive: true });
      }
      
      await writeFile(fullPath, content, 'utf-8');
      console.log(`  ✓ ${filePath}`);
    }

    console.log(`\n✅ MCP server generated successfully!\n`);
    console.log(`Next steps:`);
    console.log(`  cd ${outputDir}`);
    console.log(`  npm install`);
    console.log(`  npm run build`);
    console.log(`  npm run start:http    # For Cursor/HTTP transport`);
    console.log(`  npm start             # For Claude Desktop/stdio transport`);

    if (values.emcy) {
      console.log(`\nEmcy Telemetry:`);
      console.log(`  Set EMCY_API_KEY in .env to enable telemetry.`);
      console.log(`  Get your API key at https://emcy.ai/dashboard`);
    }

    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('\nError generating MCP server:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function loadSpec(urlOrPath: string): Promise<string | object> {
  // Check if it's a URL
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    const response = await fetch(urlOrPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('yaml') || urlOrPath.match(/\.ya?ml$/i)) {
      // Return as string for YAML parsing by swagger-parser
      return await response.text();
    }
    return (await response.json()) as object;
  }

  // It's a file path
  const resolved = resolve(urlOrPath);
  if (!existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const content = await readFile(resolved, 'utf-8');
  
  // Try to parse as JSON first
  if (resolved.endsWith('.json')) {
    return JSON.parse(content) as object;
  }
  
  // Return as string for YAML parsing
  return content;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
