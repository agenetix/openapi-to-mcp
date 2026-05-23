/**
 * Types for OpenAPI to MCP conversion
 */

export interface OpenAPIEndpoint {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  parameters: EndpointParameter[];
  requestBody?: RequestBodySchema;
  securitySchemes: string[];
  /** OAuth scopes required by this endpoint (extracted from OpenAPI security requirements) */
  requiredScopes: string[];
  tags: string[];
}

export interface EndpointParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema: JSONSchemaType;
  description?: string;
}

export interface RequestBodySchema {
  required: boolean;
  contentType: string;
  description?: string;
  schema: JSONSchemaType;
}

export interface JSONSchemaType {
  type?: string | string[];
  format?: string;
  properties?: Record<string, JSONSchemaType>;
  items?: JSONSchemaType;
  required?: string[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JSONSchemaType;
  oneOf?: JSONSchemaType[];
  anyOf?: JSONSchemaType[];
  allOf?: JSONSchemaType[];
  $ref?: string;
}

export interface McpToolDefinition {
  name: string;
  /** Backward-compatible names accepted for tool calls but not exposed in tools/list. */
  aliases?: string[];
  description: string;
  inputSchema: JSONSchemaType;
  httpMethod: string;
  pathTemplate: string;
  parameters: EndpointParameter[];
  requestBodyContentType?: string;
  securitySchemes: string[];
  /** OAuth scopes required to invoke this tool */
  requiredScopes: string[];
}

export interface ParsedOpenAPI {
  title: string;
  version: string;
  description?: string;
  baseUrl?: string;
  endpoints: OpenAPIEndpoint[];
  securitySchemes: Record<string, SecurityScheme>;
}

export interface SecurityScheme {
  type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
  name?: string;
  in?: 'header' | 'query' | 'cookie';
  scheme?: string;
  bearerFormat?: string;
  flows?: OAuthFlows;
  openIdConnectUrl?: string;
}

export interface OAuthFlows {
  implicit?: OAuthFlow;
  password?: OAuthFlow;
  clientCredentials?: OAuthFlow;
  authorizationCode?: OAuthFlow;
}

export interface OAuthFlow {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
}

/**
 * MCP Prompt Definition
 * Per MCP specification: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
 * Prompts are pre-defined templates that help users accomplish specific tasks.
 */
export interface PromptDefinition {
  /** Unique identifier for the prompt */
  name: string;
  /** Human-readable title for the prompt */
  title?: string;
  /** Description of what this prompt does */
  description: string;
  /** The prompt content (text that will be sent to the AI) */
  content: string;
  /**
   * Optional arguments for dynamic prompts.
   * When provided, the prompt becomes a template with {{argName}} placeholders.
   */
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  /** Argument name (used as placeholder in content: {{name}}) */
  name: string;
  /** Description of the argument */
  description: string;
  /** Whether this argument is required */
  required: boolean;
}

export type RuntimeMode =
  | "standalone_no_auth"
  | "standalone_headers"
  | "emcy_gateway_worker";

export interface UpstreamHeaderConfig {
  /** Header name to send to the upstream API on every request. */
  name: string;
  /** Environment variable that provides the header value at runtime. */
  envVar: string;
  /** Optional prefix prepended to the env var value, e.g. "Bearer". */
  valuePrefix?: string;
  /** Optional default value written into the generated .env.example. */
  defaultValue?: string;
}

export interface GatewayWorkerConfig {
  workerSecretHeader?: string;
  workerSecretEnvVar?: string;
  upstreamAccessTokenHeader?: string;
}

export interface ToolInstructionConfig {
  customInstructions?: string;
  exampleUsage?: string;
  whenToUse?: string;
  whenNotToUse?: string;
}

export interface GatewayOauthConfig {
  provider?: string;
  authorizationServerUrl?: string;
  clientId?: string;
  resource?: string;
  scopes?: string[];
}

/**
 * @deprecated Prefer `GatewayWorkerConfig`.
 */
export type HostedWorkerConfig = GatewayWorkerConfig;

/**
 * @deprecated Prefer `GatewayOauthConfig`.
 */
export type HostedOauthConfig = GatewayOauthConfig;

export interface EmcyGatewayIntegrationConfig {
  provider: "emcy";
  oauth?: GatewayOauthConfig;
  worker?: GatewayWorkerConfig;
}

export interface GeneratorOptions {
  name: string;
  version?: string;
  baseUrl: string;
  enabledEndpoints?: Set<string>;  // Optional: filter to only these canonical tool keys
  emcyEnabled?: boolean;
  /**
   * For local development: path to local @emcy/sdk package.
   * When set, generated package.json will use "file:<path>" instead of npm version.
   * Example: "../../packages/emcy-sdk" or "/absolute/path/to/emcy-sdk"
   */
  localSdkPath?: string;
  /**
   * Low-level runtime shape for the generated output.
   * Most callers should prefer `gatewayIntegration` when they want
   * Emcy Gateway in front of the generated server, instead of depending on
   * Emcy-specific runtime mode names directly.
   *
   * - standalone_no_auth: public MCP server with no upstream auth handling
   * - standalone_headers: public MCP server that injects static/custom headers for upstream calls
   * - emcy_gateway_worker: internal runtime used when the generated server sits behind Emcy Gateway/Host
   */
  runtimeMode?: RuntimeMode;
  /**
   * Static headers applied to every upstream API call.
   * Useful for API keys, tenant IDs, or other custom headers.
   */
  upstreamHeaders?: UpstreamHeaderConfig[];
  /**
   * Optional integration contract for generating a runtime intended to sit
   * behind Emcy Gateway. This is the preferred public API for Gateway-backed
   * generation.
   */
  gatewayIntegration?: EmcyGatewayIntegrationConfig;
  /**
   * @deprecated Prefer `gatewayIntegration.worker`.
   * Back-compat config for generated servers that use Emcy Host/Gateway.
   */
  hostedWorkerConfig?: HostedWorkerConfig;
  /**
   * Tool-specific guidance keyed by canonical tool key.
   * Emcy uses this as part of the canonical generation config shared by the
   * wizard, CLI reproduction, and server regeneration.
   */
  toolInstructions?: Record<string, ToolInstructionConfig>;
  /**
   * @deprecated Prefer `gatewayIntegration.oauth`.
   * Downstream OAuth metadata for generated servers that will use Emcy Gateway.
   */
  hostedOauthConfig?: HostedOauthConfig;
  /**
   * MCP Prompts configuration.
   * Prompts are pre-defined templates that help AI understand context and accomplish specific tasks.
   * These are exposed via the prompts/list and prompts/get MCP endpoints.
   */
  prompts?: PromptDefinition[];
}

export interface GeneratedFiles {
  [path: string]: string;
}
