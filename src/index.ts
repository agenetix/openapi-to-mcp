/**
 * MCP Stack OpenAPI to MCP Generator
 * 
 * Converts OpenAPI specifications to MCP servers with optional MCP Stack telemetry.
 */

export { parseOpenAPI, validateOpenAPI, generateOperationId } from './parser.js';
export { mapToMcpTools, getEndpointKey, getAllEndpointKeys } from './mapper.js';
export { generateMcpServer } from './generator.js';
export {
  buildMcpToolName,
  buildToolKey,
  buildDisplayName,
  buildWorkspaceToolName,
  CURRENT_TOOL_NAMING_VERSION,
  MAX_MCP_TOOL_NAME_LENGTH,
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
  PromptDefinition,
  PromptArgument,
  RuntimeMode,
  UpstreamHeaderConfig,
  McpStackGatewayIntegrationConfig,
  HostedWorkerConfig,
  ToolInstructionConfig,
  HostedOauthConfig,
} from './types.js';
