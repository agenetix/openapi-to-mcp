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
  | "emcy_hosted_worker";

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

export interface HostedWorkerConfig {
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

export interface HostedOauthConfig {
  provider?: string;
  authorizationServerUrl?: string;
  clientId?: string;
  resource?: string;
  scopes?: string[];
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
   * Runtime shape for the generated output.
   * - standalone_no_auth: public MCP server with no upstream auth handling
   * - standalone_headers: public MCP server that injects static/custom headers for upstream calls
   * - emcy_hosted_worker: internal worker behind Emcy-hosted MCP auth/runtime
   */
  runtimeMode?: RuntimeMode;
  /**
   * Static headers applied to every upstream API call.
   * Useful for API keys, tenant IDs, or other custom headers.
   */
  upstreamHeaders?: UpstreamHeaderConfig[];
  /**
   * Hosted worker mode for Emcy-hosted MCP servers.
   * In this mode the generated runtime is an internal execution worker, not the
   * public MCP OAuth/resource boundary. Emcy forwards a downstream app token on
   * each request and authenticates to the worker with a shared secret.
   */
  hostedWorkerConfig?: HostedWorkerConfig;
  /**
   * Tool-specific guidance keyed by canonical tool key.
   * Emcy uses this as part of the canonical generation config shared by the
   * wizard, CLI reproduction, and server regeneration.
   */
  toolInstructions?: Record<string, ToolInstructionConfig>;
  /**
   * Hosted OAuth metadata for Emcy-hosted workers.
   * The private worker does not execute OAuth itself, but generated docs should
   * still reflect the intended hosted auth configuration.
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
