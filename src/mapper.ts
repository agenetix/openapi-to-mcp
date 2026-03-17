/**
 * Tool Mapper - Maps OpenAPI endpoints to MCP tool definitions
 */

import type {
  OpenAPIEndpoint,
  McpToolDefinition,
  JSONSchemaType,
  EndpointParameter,
} from "./types.js";
import { buildToolKey } from "./tool-identity.js";

/**
 * Map OpenAPI endpoints to MCP tool definitions
 */
export function mapToMcpTools(
  endpoints: OpenAPIEndpoint[],
  enabledPaths?: Set<string>
): McpToolDefinition[] {
  return endpoints
    .filter((endpoint) => {
      if (!enabledPaths) return true;
      const key = `${endpoint.method}:${endpoint.path}`;
      return enabledPaths.has(key);
    })
    .map((endpoint) => mapEndpointToTool(endpoint));
}

function mapEndpointToTool(endpoint: OpenAPIEndpoint): McpToolDefinition {
  const inputSchema = buildInputSchema(endpoint);

  // Build description from summary and path
  let description =
    endpoint.summary || `Executes ${endpoint.method} ${endpoint.path}`;
  if (endpoint.description && endpoint.description !== endpoint.summary) {
    description += `\n\n${endpoint.description}`;
  }

  return {
    name: buildToolKey(endpoint.method, endpoint.path),
    description,
    inputSchema,
    httpMethod: endpoint.method.toLowerCase(),
    pathTemplate: endpoint.path,
    parameters: endpoint.parameters,
    requestBodyContentType: endpoint.requestBody?.contentType,
    securitySchemes: endpoint.securitySchemes,
    requiredScopes: endpoint.requiredScopes,
  };
}

function buildInputSchema(endpoint: OpenAPIEndpoint): JSONSchemaType {
  const properties: Record<string, JSONSchemaType> = {};
  const required: string[] = [];

  // Add parameters to schema
  for (const param of endpoint.parameters) {
    properties[param.name] = {
      ...param.schema,
      description: param.description || param.schema.description,
    };

    if (param.required) {
      required.push(param.name);
    }
  }

  // Add request body to schema
  if (endpoint.requestBody) {
    properties.requestBody = {
      ...endpoint.requestBody.schema,
      description: "The JSON request body.",
    };

    if (endpoint.requestBody.required) {
      required.push("requestBody");
    }
  }

  const schema: JSONSchemaType = {
    type: "object",
    properties,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

/**
 * Generate a unique key for an endpoint
 */
export function getEndpointKey(endpoint: OpenAPIEndpoint): string {
  return `${endpoint.method}:${endpoint.path}`;
}

/**
 * Get all endpoint keys from a list of endpoints
 */
export function getAllEndpointKeys(endpoints: OpenAPIEndpoint[]): string[] {
  return endpoints.map(getEndpointKey);
}
