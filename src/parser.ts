/**
 * OpenAPI Parser - Parses OpenAPI 3.x specs and extracts endpoint information
 */

import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import type { OpenAPIEndpoint, ParsedOpenAPI, EndpointParameter, RequestBodySchema, SecurityScheme, JSONSchemaType } from './types.js';

type OpenAPI3Doc = OpenAPIV3.Document | OpenAPIV3_1.Document;
type OpenAPI3Operation = OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject;
type OpenAPI3Parameter = OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject;
type OpenAPI3RequestBody = OpenAPIV3.RequestBodyObject | OpenAPIV3_1.RequestBodyObject;
type OpenAPI3Schema = OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;

/**
 * Parse an OpenAPI specification from a string (JSON or YAML) or URL
 */
export async function parseOpenAPI(input: string | object): Promise<ParsedOpenAPI> {
  // Dereference resolves all $ref pointers
  const api = await SwaggerParser.dereference(input as OpenAPI.Document) as OpenAPI3Doc;
  
  return extractFromSpec(api);
}

/**
 * Validate an OpenAPI specification
 */
export async function validateOpenAPI(input: string | object): Promise<{ valid: boolean; errors?: string[] }> {
  try {
    await SwaggerParser.validate(input as OpenAPI.Document);
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, errors: [message] };
  }
}

function extractFromSpec(api: OpenAPI3Doc): ParsedOpenAPI {
  const endpoints: OpenAPIEndpoint[] = [];
  const securitySchemes: Record<string, SecurityScheme> = {};
  
  // Extract security schemes
  const components = api.components;
  if (components?.securitySchemes) {
    for (const [name, scheme] of Object.entries(components.securitySchemes)) {
      if (!isReference(scheme)) {
        securitySchemes[name] = extractSecurityScheme(scheme);
      }
    }
  }
  
  // Extract base URL from servers
  const baseUrl = api.servers?.[0]?.url || '';
  
  // Extract global security requirements (applied to endpoints that don't override)
  const globalSecurity = api.security || [];

  // Extract endpoints from paths
  if (api.paths) {
    for (const [path, pathItem] of Object.entries(api.paths)) {
      if (!pathItem || isReference(pathItem)) continue;
      
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
      
      for (const method of methods) {
        const operation = pathItem[method] as OpenAPI3Operation | undefined;
        if (!operation) continue;
        
        const endpoint = extractEndpoint(path, method.toUpperCase(), operation, pathItem.parameters, globalSecurity);
        endpoints.push(endpoint);
      }
    }
  }
  
  return {
    title: api.info.title,
    version: api.info.version,
    description: api.info.description,
    baseUrl,
    endpoints,
    securitySchemes,
  };
}

function extractEndpoint(
  path: string,
  method: string,
  operation: OpenAPI3Operation,
  pathParameters?: (OpenAPI3Parameter | OpenAPIV3.ReferenceObject | OpenAPIV3_1.ReferenceObject)[],
  globalSecurity?: OpenAPIV3.SecurityRequirementObject[]
): OpenAPIEndpoint {
  const parameters: EndpointParameter[] = [];
  
  // Combine path-level and operation-level parameters
  const allParams = [...(pathParameters || []), ...(operation.parameters || [])];
  
  for (const param of allParams) {
    if (isReference(param)) continue;
    parameters.push(extractParameter(param as OpenAPI3Parameter));
  }
  
  // Extract request body
  let requestBody: RequestBodySchema | undefined;
  if (operation.requestBody && !isReference(operation.requestBody)) {
    requestBody = extractRequestBody(operation.requestBody as OpenAPI3RequestBody);
  }
  
  // Extract security requirements: operation-level overrides global
  const securitySchemes: string[] = [];
  const requiredScopes: string[] = [];
  const security = operation.security ?? globalSecurity ?? [];
  for (const req of security) {
    for (const [schemeName, scopes] of Object.entries(req)) {
      securitySchemes.push(schemeName);
      if (Array.isArray(scopes)) {
        requiredScopes.push(...scopes);
      }
    }
  }
  
  // Generate operationId if not present
  const operationId = operation.operationId || generateOperationId(method, path);
  
  return {
    operationId,
    method,
    path,
    summary: operation.summary,
    description: operation.description,
    parameters,
    requestBody,
    securitySchemes,
    requiredScopes: [...new Set(requiredScopes)],
    tags: operation.tags || [],
  };
}

function extractParameter(param: OpenAPI3Parameter): EndpointParameter {
  return {
    name: param.name,
    in: param.in as EndpointParameter['in'],
    required: param.required || false,
    schema: (param.schema as JSONSchemaType) || { type: 'string' },
    description: param.description,
  };
}

function extractRequestBody(body: OpenAPI3RequestBody): RequestBodySchema | undefined {
  const content = body.content;
  const description =
    body.description
    || (content?.['application/json']?.schema as OpenAPI3Schema | undefined)?.description;
  
  // Prefer JSON content type
  const jsonContent = content?.['application/json'];
  if (jsonContent?.schema) {
    return {
      required: body.required || false,
      contentType: 'application/json',
      description,
      schema: jsonContent.schema as JSONSchemaType,
    };
  }
  
  // Fallback to first available content type
  const [contentType, mediaType] = Object.entries(content || {})[0] || [];
  if (contentType && mediaType?.schema) {
    return {
      required: body.required || false,
      contentType,
      description: description || (mediaType.schema as OpenAPI3Schema | undefined)?.description,
      schema: mediaType.schema as JSONSchemaType,
    };
  }
  
  return undefined;
}

function extractSecurityScheme(scheme: OpenAPIV3.SecuritySchemeObject | OpenAPIV3_1.SecuritySchemeObject): SecurityScheme {
  const result: SecurityScheme = {
    type: scheme.type as SecurityScheme['type'],
  };
  
  if (scheme.type === 'apiKey') {
    result.name = scheme.name;
    result.in = scheme.in as SecurityScheme['in'];
  } else if (scheme.type === 'http') {
    result.scheme = scheme.scheme;
    result.bearerFormat = scheme.bearerFormat;
  } else if (scheme.type === 'oauth2' && 'flows' in scheme) {
    result.flows = scheme.flows as SecurityScheme['flows'];
  } else if (scheme.type === 'openIdConnect' && 'openIdConnectUrl' in scheme) {
    result.openIdConnectUrl = scheme.openIdConnectUrl;
  }
  
  return result;
}

/**
 * Generate a consistent operationId from method and path.
 * 
 * IMPORTANT: This function is duplicated in:
 *   - mcpstack/src/MCP Stack.Web/app/[lng]/components/wizard/actions.ts
 * 
 * Both implementations MUST stay in sync! If you modify this function,
 * update the wizard's generateOperationId() function as well.
 * 
 * Examples:
 *   GET /users -> GetUsers
 *   GET /users/{id} -> GetUsersById
 *   POST /orders/{orderId}/items -> PostOrdersByOrderIdItems
 */
export function generateOperationId(method: string, path: string): string {
  // Convert path like /users/{id}/posts to UsersByIdPosts
  const pathParts = path
    .split('/')
    .filter(Boolean)
    .map(part => {
      if (part.startsWith('{') && part.endsWith('}')) {
        return 'By' + capitalize(part.slice(1, -1));
      }
      return capitalize(part);
    })
    .join('');
  
  return capitalize(method.toLowerCase()) + pathParts;
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isReference(obj: unknown): obj is OpenAPIV3.ReferenceObject | OpenAPIV3_1.ReferenceObject {
  return typeof obj === 'object' && obj !== null && '$ref' in obj;
}
