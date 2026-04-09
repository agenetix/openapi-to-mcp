/**
 * Parser tests - ensures OpenAPI specs are correctly parsed into our format
 */

import { describe, it, expect } from 'vitest';
import { parseOpenAPI, validateOpenAPI, generateOperationId } from '../parser.js';

describe('generateOperationId', () => {
  it('should generate operationId from simple path', () => {
    expect(generateOperationId('get', '/users')).toBe('GetUsers');
    expect(generateOperationId('post', '/orders')).toBe('PostOrders');
    expect(generateOperationId('delete', '/products')).toBe('DeleteProducts');
  });

  it('should handle path parameters with "By" prefix', () => {
    expect(generateOperationId('get', '/users/{id}')).toBe('GetUsersById');
    expect(generateOperationId('get', '/orders/{orderId}')).toBe('GetOrdersByOrderId');
    expect(generateOperationId('delete', '/products/{productId}')).toBe('DeleteProductsByProductId');
  });

  it('should handle multiple path segments', () => {
    expect(generateOperationId('get', '/users/{userId}/orders')).toBe('GetUsersByUserIdOrders');
    expect(generateOperationId('post', '/shops/{shopId}/products/{productId}')).toBe('PostShopsByShopIdProductsByProductId');
  });

  it('should handle nested paths with parameters', () => {
    expect(generateOperationId('patch', '/orders/{id}/status')).toBe('PatchOrdersByIdStatus');
    expect(generateOperationId('get', '/api/v1/users')).toBe('GetApiV1Users');
  });

  it('should handle root path', () => {
    expect(generateOperationId('get', '/')).toBe('Get');
  });

  it('should capitalize method name', () => {
    expect(generateOperationId('GET', '/users')).toBe('GetUsers');
    expect(generateOperationId('POST', '/orders')).toBe('PostOrders');
  });
});

describe('parseOpenAPI', () => {
  it('should parse a minimal OpenAPI spec', async () => {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0',
      },
      paths: {},
    };

    const result = await parseOpenAPI(spec);

    expect(result.title).toBe('Test API');
    expect(result.version).toBe('1.0.0');
    expect(result.endpoints).toEqual([]);
  });

  it('should parse endpoints from paths', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            summary: 'Get all users',
            operationId: 'getUsers',
          },
          post: {
            summary: 'Create user',
            operationId: 'createUser',
          },
        },
      },
    };

    const result = await parseOpenAPI(spec);

    expect(result.endpoints).toHaveLength(2);
    
    const getUsers = result.endpoints.find(e => e.operationId === 'getUsers');
    expect(getUsers).toBeDefined();
    expect(getUsers?.method).toBe('GET');
    expect(getUsers?.path).toBe('/users');
    expect(getUsers?.summary).toBe('Get all users');
    
    const createUser = result.endpoints.find(e => e.operationId === 'createUser');
    expect(createUser).toBeDefined();
    expect(createUser?.method).toBe('POST');
  });

  it('should generate operationId when not provided', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/products/{id}': {
          get: {
            summary: 'Get product',
          },
          delete: {},
        },
      },
    };

    const result = await parseOpenAPI(spec);

    expect(result.endpoints).toHaveLength(2);
    
    const getProduct = result.endpoints.find(e => e.method === 'GET');
    expect(getProduct?.operationId).toBe('GetProductsById');
    
    const deleteProduct = result.endpoints.find(e => e.method === 'DELETE');
    expect(deleteProduct?.operationId).toBe('DeleteProductsById');
  });

  it('should parse path parameters', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users/{userId}': {
          get: {
            parameters: [
              {
                name: 'userId',
                in: 'path',
                required: true,
                schema: { type: 'integer' },
                description: 'User ID',
              },
            ],
          },
        },
      },
    };

    const result = await parseOpenAPI(spec);

    expect(result.endpoints[0].parameters).toHaveLength(1);
    expect(result.endpoints[0].parameters[0]).toEqual({
      name: 'userId',
      in: 'path',
      required: true,
      schema: { type: 'integer' },
      description: 'User ID',
    });
  });

  it('should parse query parameters', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            parameters: [
              {
                name: 'limit',
                in: 'query',
                required: false,
                schema: { type: 'integer', default: 10 },
              },
              {
                name: 'offset',
                in: 'query',
                schema: { type: 'integer' },
              },
            ],
          },
        },
      },
    };

    const result = await parseOpenAPI(spec);

    expect(result.endpoints[0].parameters).toHaveLength(2);
    expect(result.endpoints[0].parameters[0].name).toBe('limit');
    expect(result.endpoints[0].parameters[0].required).toBe(false);
    expect(result.endpoints[0].parameters[1].name).toBe('offset');
  });

  it('should parse request body', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          post: {
            requestBody: {
              description: 'Fields used to create a user.',
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                    required: ['name', 'email'],
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = await parseOpenAPI(spec);

    expect(result.endpoints[0].requestBody).toBeDefined();
    expect(result.endpoints[0].requestBody?.required).toBe(true);
    expect(result.endpoints[0].requestBody?.contentType).toBe('application/json');
    expect(result.endpoints[0].requestBody?.description).toBe('Fields used to create a user.');
    expect(result.endpoints[0].requestBody?.schema.type).toBe('object');
  });

  it('should parse security schemes', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/secure': {
          get: {
            security: [{ apiKey: [] }],
          },
        },
      },
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'X-API-Key',
            in: 'header',
          },
        },
      },
    };

    const result = await parseOpenAPI(spec);

    expect(result.endpoints[0].securitySchemes).toEqual(['apiKey']);
    expect(result.securitySchemes.apiKey).toEqual({
      type: 'apiKey',
      name: 'X-API-Key',
      in: 'header',
    });
  });

  it('should extract base URL from servers', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [{ url: 'https://api.example.com/v1' }],
      paths: {},
    };

    const result = await parseOpenAPI(spec);

    expect(result.baseUrl).toBe('https://api.example.com/v1');
  });

  it('should handle missing servers', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
    };

    const result = await parseOpenAPI(spec);

    expect(result.baseUrl).toBe('');
  });
});

describe('validateOpenAPI', () => {
  it('should validate a correct spec', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {},
    };

    const result = await validateOpenAPI(spec);

    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should reject an invalid spec', async () => {
    const spec = {
      // Missing required 'openapi' field
      info: { title: 'Test API' },
      paths: {},
    };

    const result = await validateOpenAPI(spec);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);
  });
});
