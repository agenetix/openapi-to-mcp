/**
 * Generator tests - ensures MCP server code is correctly generated
 */

import { describe, it, expect } from 'vitest';
import { generateMcpServer } from '../generator.js';
import type { McpToolDefinition, GeneratorOptions } from '../types.js';

describe('generateMcpServer', () => {
  const baseOptions: GeneratorOptions = {
    name: 'test-api',
    version: '1.0.0',
    baseUrl: 'http://localhost:3000',
  };

  it('should generate all required files', () => {
    const tools: McpToolDefinition[] = [];
    const files = generateMcpServer(tools, baseOptions);

    expect(Object.keys(files)).toEqual([
      'package.json',
      'tsconfig.json',
      'src/index.ts',
      'src/transport.ts',
      '.env.example',
      'README.md',
    ]);
  });

  it('should generate valid package.json', () => {
    const files = generateMcpServer([], baseOptions);
    const pkg = JSON.parse(files['package.json']);

    expect(pkg.name).toBe('test-api');
    expect(pkg.version).toBe('1.0.0');
    expect(pkg.type).toBe('module');
    expect(pkg.scripts.build).toBe('tsc');
    expect(pkg.scripts['start:http']).toBe('node build/index.js --transport=streamable-http');
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
    expect(pkg.dependencies.axios).toBeDefined();
  });

  it('should include @emcy/sdk when emcyEnabled', () => {
    const files = generateMcpServer([], { ...baseOptions, emcyEnabled: true });
    const pkg = JSON.parse(files['package.json']);

    expect(pkg.dependencies['@emcy/sdk']).toBeDefined();
  });

  it('should use local SDK path when specified', () => {
    const files = generateMcpServer([], {
      ...baseOptions,
      emcyEnabled: true,
      localSdkPath: '../emcy-sdk',
    });
    const pkg = JSON.parse(files['package.json']);

    expect(pkg.dependencies['@emcy/sdk']).toBe('file:../emcy-sdk');
  });

  it('should generate tool definitions in server entry', () => {
    const tools: McpToolDefinition[] = [
      {
        name: 'getUsers',
        description: 'Get all users',
        inputSchema: { type: 'object', properties: {} },
        httpMethod: 'get',
        pathTemplate: '/users',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
      },
      {
        name: 'createUser',
        description: 'Create a user',
        inputSchema: {
          type: 'object',
          properties: { requestBody: { type: 'object' } },
          required: ['requestBody'],
        },
        httpMethod: 'post',
        pathTemplate: '/users',
        parameters: [],
        requestBodyContentType: 'application/json',
        securitySchemes: [],
        requiredScopes: [],
      },
    ];

    const files = generateMcpServer(tools, baseOptions);
    const serverCode = files['src/index.ts'];

    // Should contain tool definitions
    expect(serverCode).toContain('["getUsers"');
    expect(serverCode).toContain('name: "getUsers"');
    expect(serverCode).toContain('description: "Get all users"');
    expect(serverCode).toContain('method: "get"');
    expect(serverCode).toContain('pathTemplate: "/users"');

    expect(serverCode).toContain('["createUser"');
    expect(serverCode).toContain('name: "createUser"');
    expect(serverCode).toContain('requestBodyContentType: "application/json"');
  });

  it('should include Emcy telemetry code when enabled', () => {
    const files = generateMcpServer([], { ...baseOptions, emcyEnabled: true });
    const serverCode = files['src/index.ts'];

    expect(serverCode).toContain("import { EmcyTelemetry } from '@emcy/sdk'");
    expect(serverCode).toContain('new EmcyTelemetry({');
    expect(serverCode).toContain('emcy.trace(');
  });

  it('should not include Emcy code when disabled', () => {
    const files = generateMcpServer([], baseOptions);
    const serverCode = files['src/index.ts'];

    expect(serverCode).not.toContain('EmcyTelemetry');
    expect(serverCode).not.toContain('emcy.trace');
  });

  it('should set correct base URL in server', () => {
    const files = generateMcpServer([], {
      ...baseOptions,
      baseUrl: 'https://api.example.com/v1',
    });
    const serverCode = files['src/index.ts'];

    expect(serverCode).toContain('API_BASE_URL = process.env.API_BASE_URL || "https://api.example.com/v1"');
  });

  it('should include security schemes in generated code', () => {
    const securitySchemes = {
      apiKey: {
        type: 'apiKey' as const,
        name: 'X-API-Key',
        in: 'header' as const,
      },
      bearerAuth: {
        type: 'http' as const,
        scheme: 'bearer',
      },
    };

    const tools: McpToolDefinition[] = [
      {
        name: 'secureEndpoint',
        description: 'A secure endpoint',
        inputSchema: { type: 'object', properties: {} },
        httpMethod: 'get',
        pathTemplate: '/secure',
        parameters: [],
        securitySchemes: ['apiKey', 'bearerAuth'],
        requiredScopes: [],
      },
    ];

    const files = generateMcpServer(tools, baseOptions, securitySchemes);
    const serverCode = files['src/index.ts'];

    expect(serverCode).toContain('"apiKey"');
    expect(serverCode).toContain('"bearerAuth"');
    expect(serverCode).toContain('applySecurityHeaders');
  });

  it('should generate proper path parameter handling', () => {
    const tools: McpToolDefinition[] = [
      {
        name: 'getUser',
        description: 'Get user by ID',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'integer' } },
          required: ['id'],
        },
        httpMethod: 'get',
        pathTemplate: '/users/{id}',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        securitySchemes: [],
        requiredScopes: [],
      },
    ];

    const files = generateMcpServer(tools, baseOptions);
    const serverCode = files['src/index.ts'];

    expect(serverCode).toContain('pathTemplate: "/users/{id}"');
    expect(serverCode).toContain('"in":"path"');
  });

  it('should generate README with correct server name', () => {
    const files = generateMcpServer([], { ...baseOptions, name: 'my-awesome-api' });
    const readme = files['README.md'];

    expect(readme).toContain('# my-awesome-api');
    expect(readme).toContain('my-awesome-api');
  });

  it('should generate .env.example with API URL', () => {
    const files = generateMcpServer([], baseOptions);
    const envExample = files['.env.example'];

    expect(envExample).toContain('API_BASE_URL=');
    expect(envExample).toContain('PORT=3000');
  });

  it('should generate .env.example with security credentials when needed', () => {
    const tools: McpToolDefinition[] = [
      {
        name: 'secureEndpoint',
        description: 'Secure',
        inputSchema: { type: 'object', properties: {} },
        httpMethod: 'get',
        pathTemplate: '/secure',
        parameters: [],
        securitySchemes: ['apiKeyAuth'],
        requiredScopes: [],
      },
    ];

    const securitySchemes = {
      apiKeyAuth: { type: 'apiKey' as const, name: 'X-API-Key', in: 'header' as const },
    };

    const files = generateMcpServer(tools, baseOptions, securitySchemes);
    const envExample = files['.env.example'];

    expect(envExample).toContain('Security Credentials');
    expect(envExample).toContain('API_KEY_APIKEYAUTH=');
  });
});

describe('generator produces working TypeScript', () => {
  it('should generate syntactically valid TypeScript (no obvious errors)', () => {
    const tools: McpToolDefinition[] = [
      {
        name: 'complexTool',
        description: 'A tool with "quotes" and special chars: <>&',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'User\'s name' },
            data: { type: 'object' },
          },
          required: ['name'],
        },
        httpMethod: 'post',
        pathTemplate: '/complex/{id}/action',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBodyContentType: 'application/json',
        securitySchemes: ['auth'],
        requiredScopes: [],
      },
    ];

    const files = generateMcpServer(tools, {
      name: 'complex-api',
      baseUrl: 'https://api.example.com',
      emcyEnabled: true,
    }, {
      auth: { type: 'http', scheme: 'bearer' },
    });

    const serverCode = files['src/index.ts'];

    // Should have balanced braces (basic syntax check)
    const openBraces = (serverCode.match(/{/g) || []).length;
    const closeBraces = (serverCode.match(/}/g) || []).length;
    expect(openBraces).toBe(closeBraces);

    // Should have balanced brackets
    const openBrackets = (serverCode.match(/\[/g) || []).length;
    const closeBrackets = (serverCode.match(/\]/g) || []).length;
    expect(openBrackets).toBe(closeBrackets);

    // Should have balanced parentheses
    const openParens = (serverCode.match(/\(/g) || []).length;
    const closeParens = (serverCode.match(/\)/g) || []).length;
    expect(openParens).toBe(closeParens);
  });
});

