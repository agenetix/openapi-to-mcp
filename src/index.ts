/**
 * Emcy OpenAPI to MCP Generator
 * 
 * Converts OpenAPI specifications to MCP servers with optional Emcy telemetry.
 */

export { parseOpenAPI, validateOpenAPI, generateOperationId } from './parser.js';
export { mapToMcpTools, getEndpointKey, getAllEndpointKeys } from './mapper.js';
export { generateMcpServer } from './generator.js';
export {
  buildToolKey,
  buildDisplayName,
  buildWorkspaceToolName,
  CURRENT_TOOL_NAMING_VERSION,
  MAX_TOOL_KEY_LENGTH,
} from './tool-identity.js';

export type {
  OpenAPIEndpoint,
  ParsedOpenAPI,
  McpToolDefinition,
  GeneratorOptions,
  GeneratedFiles,
  EndpointParameter,
  SecurityScheme,
} from './types.js';
