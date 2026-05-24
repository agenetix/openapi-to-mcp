/**
 * Mapper tests - ensures endpoints are correctly mapped to MCP tool definitions
 */

import { describe, it, expect } from 'vitest';
import { mapToMcpTools, getEndpointKey, getAllEndpointKeys } from '../mapper.js';
import type { OpenAPIEndpoint } from '../types.js';

describe('mapToMcpTools', () => {
  it('should map a simple GET endpoint to a tool', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'getUsers',
        method: 'GET',
        path: '/users',
        summary: 'Get all users',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
    ];

    const tools = mapToMcpTools(endpoints);

    expect(tools).toHaveLength(1);
    expect(tools[0]).toEqual({
      name: 'get_users',
      aliases: [],
      description: 'Get all users',
      inputSchema: { type: 'object', properties: {} },
      httpMethod: 'get',
      pathTemplate: '/users',
      parameters: [],
      requestBodyContentType: undefined,
      securitySchemes: [],
      requiredScopes: [],
    });
  });

  it('should map path parameters to input schema', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'getUser',
        method: 'GET',
        path: '/users/{id}',
        summary: 'Get user by ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer', description: 'User ID' },
          },
        ],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
    ];

    const tools = mapToMcpTools(endpoints);

    expect(tools[0].inputSchema).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'User ID' },
      },
      required: ['id'],
    });
    expect(tools[0].parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'integer', description: 'User ID' } },
    ]);
  });

  it('should map query parameters to input schema', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'searchUsers',
        method: 'GET',
        path: '/users',
        summary: 'Search users',
        parameters: [
          {
            name: 'q',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Search query',
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', default: 10 },
          },
        ],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
    ];

    const tools = mapToMcpTools(endpoints);

    expect(tools[0].inputSchema.properties).toEqual({
      q: { type: 'string', description: 'Search query' },
      limit: { type: 'integer', default: 10 },
    });
    // Neither parameter is required, so required array should not exist
    expect(tools[0].inputSchema.required).toBeUndefined();
  });

  it('should map request body to input schema', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'createUser',
        method: 'POST',
        path: '/users',
        summary: 'Create a user',
        parameters: [],
        requestBody: {
          required: true,
          contentType: 'application/json',
          description: 'Desired fields for the new user.',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
            required: ['name', 'email'],
          },
        },
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
    ];

    const tools = mapToMcpTools(endpoints);

    expect(tools[0].inputSchema.properties?.requestBody).toBeDefined();
    expect(tools[0].inputSchema.required).toContain('requestBody');
    expect(tools[0].requestBodyContentType).toBe('application/json');
    expect(tools[0].inputSchema.properties?.requestBody).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['name', 'email'],
      description: 'Desired fields for the new user.',
    });
  });

  it('should include description from endpoint', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'getUser',
        method: 'GET',
        path: '/users/{id}',
        summary: 'Get user by ID',
        description: 'Retrieves a single user by their unique identifier.',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
    ];

    const tools = mapToMcpTools(endpoints);

    expect(tools[0].description).toBe('Get user by ID\n\nRetrieves a single user by their unique identifier.');
  });

  it('should generate description from path when no summary', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'deleteUser',
        method: 'DELETE',
        path: '/users/{id}',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
    ];

    const tools = mapToMcpTools(endpoints);

    expect(tools[0].description).toBe('Executes DELETE /users/{id}');
  });

  it('should map multiple endpoints', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'getUsers',
        method: 'GET',
        path: '/users',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
      {
        operationId: 'createUser',
        method: 'POST',
        path: '/users',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
      {
        operationId: 'getUser',
        method: 'GET',
        path: '/users/{id}',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
    ];

    const tools = mapToMcpTools(endpoints);

    expect(tools).toHaveLength(3);
    expect(tools.map(t => t.name)).toEqual(['get_users', 'create_user', 'get_user']);
  });

  it('should expose operationId names while accepting path-derived aliases', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'rename_checklist',
        method: 'PATCH',
        path: '/api/checklists/{id}',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
    ];

    const tools = mapToMcpTools(endpoints);

    expect(tools[0].name).toBe('rename_checklist');
    expect(tools[0].aliases).toEqual(['patch_api_checklists_by_id']);
  });

  it('should filter by enabled paths when provided', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'getUsers',
        method: 'GET',
        path: '/users',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
      {
        operationId: 'createUser',
        method: 'POST',
        path: '/users',
        parameters: [],
        securitySchemes: [],
        requiredScopes: [],
        tags: [],
      },
    ];

    const enabledPaths = new Set(['GET:/users']);
    const tools = mapToMcpTools(endpoints, enabledPaths);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('get_users');
  });

  it('should preserve security schemes', () => {
    const endpoints: OpenAPIEndpoint[] = [
      {
        operationId: 'getSecureData',
        method: 'GET',
        path: '/secure',
        parameters: [],
        securitySchemes: ['bearerAuth', 'apiKey'],
        requiredScopes: [],
        tags: [],
      },
    ];

    const tools = mapToMcpTools(endpoints);

    expect(tools[0].securitySchemes).toEqual(['bearerAuth', 'apiKey']);
  });
});

describe('getEndpointKey', () => {
  it('should generate correct key format', () => {
    const endpoint: OpenAPIEndpoint = {
      operationId: 'getUsers',
      method: 'GET',
      path: '/users',
      parameters: [],
      securitySchemes: [],
      requiredScopes: [],
      tags: [],
    };

    expect(getEndpointKey(endpoint)).toBe('GET:/users');
  });
});

describe('getAllEndpointKeys', () => {
  it('should return all endpoint keys', () => {
    const endpoints: OpenAPIEndpoint[] = [
      { operationId: 'a', method: 'GET', path: '/users', parameters: [], securitySchemes: [], requiredScopes: [], tags: [] },
      { operationId: 'b', method: 'POST', path: '/users', parameters: [], securitySchemes: [], requiredScopes: [], tags: [] },
      { operationId: 'c', method: 'DELETE', path: '/users/{id}', parameters: [], securitySchemes: [], requiredScopes: [], tags: [] },
    ];

    const keys = getAllEndpointKeys(endpoints);

    expect(keys).toEqual(['GET:/users', 'POST:/users', 'DELETE:/users/{id}']);
  });
});
