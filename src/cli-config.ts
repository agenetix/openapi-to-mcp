import type {
  EmcyGatewayIntegrationConfig,
  GatewayOauthConfig,
  GeneratorOptions,
  PromptDefinition,
  RuntimeMode,
  ToolInstructionConfig,
  UpstreamHeaderConfig,
} from "./types.js";

function isGatewayWorkerMode(mode: RuntimeMode): boolean {
  return mode === "emcy_gateway_worker";
}

export interface GenerateCliValues {
  mode?: string;
  "use-emcy-gateway"?: boolean;
  header?: string[];
  "prompts-json"?: string;
  "tool-instructions-json"?: string;
  "gateway-provider"?: string;
  "gateway-auth-server-url"?: string;
  "gateway-client-id"?: string;
  "gateway-resource"?: string;
  "gateway-scopes"?: string;
}

export interface ParsedGeneratorCliConfig {
  runtimeMode: RuntimeMode;
  upstreamHeaders: UpstreamHeaderConfig[];
  prompts?: PromptDefinition[];
  toolInstructions?: Record<string, ToolInstructionConfig>;
  gatewayIntegration?: EmcyGatewayIntegrationConfig;
  gatewayOauthConfig?: GatewayOauthConfig;
}

export function parseGeneratorCliConfig(
  values: GenerateCliValues
): ParsedGeneratorCliConfig {
  return {
    runtimeMode: resolveRuntimeMode(
      values.mode,
      values.header,
      values["use-emcy-gateway"] === true
    ),
    upstreamHeaders: parseUpstreamHeaders(values.header),
    prompts: parsePrompts(values["prompts-json"]),
    toolInstructions: parseToolInstructions(values["tool-instructions-json"]),
    gatewayIntegration: parseEmcyGatewayIntegration(values),
    gatewayOauthConfig: parseGatewayOauthConfig(values),
  };
}

export function pickGeneratorOptions(
  baseOptions: GeneratorOptions,
  parsed: ParsedGeneratorCliConfig
): GeneratorOptions {
  return {
    ...baseOptions,
    runtimeMode: parsed.runtimeMode,
    upstreamHeaders: parsed.upstreamHeaders,
    gatewayIntegration: parsed.gatewayIntegration,
    prompts: parsed.prompts,
    toolInstructions: parsed.toolInstructions,
    hostedOauthConfig:
      parsed.gatewayIntegration?.oauth ?? parsed.gatewayOauthConfig,
    hostedWorkerConfig: isGatewayWorkerMode(parsed.runtimeMode)
      ? parsed.gatewayIntegration?.worker ??
        baseOptions.gatewayIntegration?.worker ??
        baseOptions.hostedWorkerConfig ??
        {}
      : undefined,
  };
}

export function parsePrompts(
  value: string | undefined
): PromptDefinition[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("prompts-json must be a JSON array");
  }

  return parsed as PromptDefinition[];
}

export function parseToolInstructions(
  value: string | undefined
): Record<string, ToolInstructionConfig> | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(
      "tool-instructions-json must be a JSON object keyed by tool key"
    );
  }

  return parsed as Record<string, ToolInstructionConfig>;
}

export function parseGatewayOauthConfig(
  values: GenerateCliValues
): GatewayOauthConfig | undefined {
  const provider = clean(values["gateway-provider"]);
  const authorizationServerUrl = clean(values["gateway-auth-server-url"]);
  const clientId = clean(values["gateway-client-id"]);
  const resource = clean(values["gateway-resource"]);
  const scopes = parseScopes(values["gateway-scopes"]);

  if (
    !provider &&
    !authorizationServerUrl &&
    !clientId &&
    !resource &&
    (!scopes || scopes.length === 0)
  ) {
    return undefined;
  }

  return {
    provider,
    authorizationServerUrl,
    clientId,
    resource,
    scopes,
  };
}

export function parseEmcyGatewayIntegration(
  values: GenerateCliValues
): EmcyGatewayIntegrationConfig | undefined {
  const usesGateway = values["use-emcy-gateway"] === true;
  const oauth = parseGatewayOauthConfig(values);
  const explicitMode = normalizeRuntimeMode(values.mode);
  const modeUsesGateway = explicitMode ? isGatewayWorkerMode(explicitMode) : false;

  if (!usesGateway && !modeUsesGateway && !oauth) {
    return undefined;
  }

  return {
    provider: "emcy",
    ...(oauth ? { oauth } : {}),
  };
}

export function resolveRuntimeMode(
  mode: string | undefined,
  headerArgs: string[] | undefined,
  useEmcyGateway = false
): RuntimeMode {
  if (useEmcyGateway) {
    return "emcy_gateway_worker";
  }

  const normalizedMode = normalizeRuntimeMode(mode);
  if (normalizedMode) {
    return normalizedMode;
  }

  if ((headerArgs?.length ?? 0) > 0) {
    return "standalone_headers";
  }

  return "standalone_no_auth";
}

export function normalizeRuntimeMode(
  mode: string | undefined
): RuntimeMode | undefined {
  if (!mode) {
    return undefined;
  }

  const normalized = mode.trim().toLowerCase();
  if (
    normalized === "standalone-no-auth" ||
    normalized === "standalone_no_auth"
  ) {
    return "standalone_no_auth";
  }

  if (
    normalized === "standalone-headers" ||
    normalized === "standalone_headers"
  ) {
    return "standalone_headers";
  }

  if (
    normalized === "emcy-gateway-worker" ||
    normalized === "emcy_gateway_worker"
  ) {
    return "emcy_gateway_worker";
  }

  throw new Error(
    `Unsupported --mode "${mode}". Supported modes: standalone-no-auth, standalone-headers. For Emcy Gateway-backed runtimes, use --use-emcy-gateway.`
  );
}

export function parseUpstreamHeaders(
  headerArgs: string[] | undefined
): UpstreamHeaderConfig[] {
  if (!headerArgs || headerArgs.length === 0) {
    return [];
  }

  return headerArgs.map((value) => {
    const separatorIndex = value.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
      throw new Error(`Invalid --header "${value}". Use Header-Name=ENV_VAR.`);
    }

    const name = value.slice(0, separatorIndex).trim();
    const envVar = value.slice(separatorIndex + 1).trim();
    if (!name || !envVar) {
      throw new Error(`Invalid --header "${value}". Use Header-Name=ENV_VAR.`);
    }

    return { name, envVar };
  });
}

function parseScopes(value: string | undefined): string[] | undefined {
  const cleaned = clean(value);
  if (!cleaned) {
    return undefined;
  }

  return cleaned
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
