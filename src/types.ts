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
   * MCP OAuth 2.0 configuration for client authentication.
   * The MCP server acts as an OAuth Resource Server (RFC 9728).
   * Clients (like ChatGPT) authenticate via the specified Authorization Server.
   */
  oauth2Config?: {
    /**
     * The Authorization Server issuer/base URL, or a direct
     * /.well-known/oauth-authorization-server metadata URL.
     */
    authorizationServerUrl?: string;
    /** Scopes supported by this MCP server */
    scopes?: string[];
    /**
     * The canonical URL of this MCP server (used for audience validation per RFC 8707).
     * If not set, uses MCP_RESOURCE_URL environment variable at runtime.
     */
    resourceUrl?: string;
    /**
     * JWKS cache TTL in seconds. Default: 300 (5 minutes).
     * Set to 0 to disable caching (not recommended for production).
     */
    jwksCacheTtlSeconds?: number;
  };
  /**
   * Hosted worker mode for Emcy-hosted MCP servers.
   * In this mode the generated runtime is an internal execution worker, not the
   * public MCP OAuth/resource boundary. Emcy forwards a downstream app token on
   * each request and authenticates to the worker with a shared secret.
   */
  hostedWorkerConfig?: {
    enabled: boolean;
    workerSecretHeader?: string;
    workerSecretEnvVar?: string;
    upstreamAccessTokenHeader?: string;
  };
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
