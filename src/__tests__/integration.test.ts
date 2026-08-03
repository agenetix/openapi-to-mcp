/**
 * Integration tests - end-to-end generation flow
 */

import { describe, it, expect } from 'vitest';
import { parseOpenAPI, generateOperationId } from '../parser.js';
import { mapToMcpTools } from '../mapper.js';
import { generateMcpServer } from '../generator.js';

/**
 * Sample OpenAPI spec similar to what the SampleApi produces
 * Note: No operationIds defined - they should be generated consistently
 */
const sampleApiSpec = {
  openapi: '3.0.1',
  info: {
    title: 'Sample API',
    description: 'A sample API for products and orders',
    version: 'v1',
  },
  paths: {
    '/Orders': {
      get: {
        tags: ['Orders'],
        responses: { '200': { description: 'OK' } },
      },
      post: {
        tags: ['Orders'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  productId: { type: 'integer' },
                  customerName: { type: 'string' },
                  quantity: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/Orders/{id}': {
      get: {
        tags: ['Orders'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
      delete: {
        tags: ['Orders'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
    '/Products': {
      get: {
        tags: ['Products'],
        responses: { '200': { description: 'OK' } },
      },
      post: {
        tags: ['Products'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  price: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'OK' } },
      },
    },
    '/Products/{id}': {
      get: {
        tags: ['Products'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'OK' } },
      },
    },
  },
};

describe('End-to-end generation', () => {
  it('should generate tools from OpenAPI spec without operationIds', async () => {
    const parsed = await parseOpenAPI(sampleApiSpec);
    
    expect(parsed.title).toBe('Sample API');
    expect(parsed.endpoints.length).toBe(7);
    
    // Verify generated operationIds match expected format
    const operationIds = parsed.endpoints.map(e => e.operationId);
    expect(operationIds).toContain('GetOrders');
    expect(operationIds).toContain('PostOrders');
    expect(operationIds).toContain('GetOrdersById');
    expect(operationIds).toContain('DeleteOrdersById');
    expect(operationIds).toContain('GetProducts');
    expect(operationIds).toContain('PostProducts');
    expect(operationIds).toContain('GetProductsById');
  });

  it('should map parsed endpoints to MCP tools', async () => {
    const parsed = await parseOpenAPI(sampleApiSpec);
    const tools = mapToMcpTools(parsed.endpoints);
    
    expect(tools.length).toBe(7);
    
    const getOrders = tools.find(t => t.name === 'get_orders');
    expect(getOrders).toBeDefined();
    expect(getOrders?.httpMethod).toBe('get');
    expect(getOrders?.pathTemplate).toBe('/Orders');
    
    const postOrders = tools.find(t => t.name === 'post_orders');
    expect(postOrders).toBeDefined();
    expect(postOrders?.requestBodyContentType).toBe('application/json');
    
    const getOrderById = tools.find(t => t.name === 'get_orders_by_id');
    expect(getOrderById).toBeDefined();
    expect(getOrderById?.parameters).toHaveLength(1);
    expect(getOrderById?.parameters[0].name).toBe('id');
  });

  it('should generate MCP server with all tools', async () => {
    const parsed = await parseOpenAPI(sampleApiSpec);
    const tools = mapToMcpTools(parsed.endpoints);
    const files = generateMcpServer(tools, {
      name: 'sample-api-mcp',
      version: '1.0.0',
      baseUrl: 'http://localhost:5158',
      mcpStackTelemetryEnabled: true,
    });
    
    const serverCode = files['src/index.ts'];
    
    // Verify all tools are in the generated code
    expect(serverCode).toContain('name: "get_orders"');
    expect(serverCode).toContain('name: "post_orders"');
    expect(serverCode).toContain('name: "get_orders_by_id"');
    expect(serverCode).toContain('name: "delete_orders_by_id"');
    expect(serverCode).toContain('name: "get_products"');
    expect(serverCode).toContain('name: "post_products"');
    expect(serverCode).toContain('name: "get_products_by_id"');
    
    // Verify the toolDefinitionMap is not empty
    expect(serverCode).not.toMatch(/const toolDefinitions: RuntimeToolDefinition\[] = \[\s*\]/);
  });

  it('should filter endpoints when enabledPaths is provided', async () => {
    const parsed = await parseOpenAPI(sampleApiSpec);
    const enabledPaths = new Set(['GET:/Orders', 'POST:/Orders']);
    const tools = mapToMcpTools(parsed.endpoints, enabledPaths);
    
    expect(tools.length).toBe(2);
    expect(tools.map(t => t.name)).toEqual(['get_orders', 'post_orders']);
  });
});

describe('operationId consistency', () => {
  /**
   * This test ensures the wizard's operationId generation matches the generator's.
   * The wizard uses generateOperationId (duplicated in actions.ts) to create IDs,
   * and the generator uses the same logic in parser.ts.
   * 
   * If these don't match, the wizard's endpoint selection won't correctly
   * filter the generator's tools, resulting in empty tool definitions.
   */
  it('should generate consistent operationIds across different methods and paths', () => {
    const testCases = [
      { method: 'get', path: '/users', expected: 'GetUsers' },
      { method: 'GET', path: '/users', expected: 'GetUsers' },
      { method: 'post', path: '/users', expected: 'PostUsers' },
      { method: 'get', path: '/users/{id}', expected: 'GetUsersById' },
      { method: 'delete', path: '/users/{id}', expected: 'DeleteUsersById' },
      { method: 'get', path: '/orders/{orderId}/items', expected: 'GetOrdersByOrderIdItems' },
      { method: 'patch', path: '/orders/{id}/status', expected: 'PatchOrdersByIdStatus' },
      { method: 'get', path: '/api/v1/products', expected: 'GetApiV1Products' },
      { method: 'get', path: '/', expected: 'Get' },
      { method: 'get', path: '/Orders', expected: 'GetOrders' },
      { method: 'post', path: '/Orders', expected: 'PostOrders' },
      { method: 'get', path: '/Orders/{id}', expected: 'GetOrdersById' },
    ];
    
    for (const { method, path, expected } of testCases) {
      const result = generateOperationId(method, path);
      expect(result, `generateOperationId('${method}', '${path}')`).toBe(expected);
    }
  });
});
