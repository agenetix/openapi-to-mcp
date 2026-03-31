import type {
  GeneratorOptions,
  HostedOauthConfig,
  PromptDefinition,
  RuntimeMode,
  ToolInstructionConfig,
  UpstreamHeaderConfig,
} from "./types.js";

export interface GenerateCliValues {
  mode?: string;
  header?: string[];
  "prompts-json"?: string;
  "tool-instructions-json"?: string;
  "hosted-provider"?: string;
  "hosted-auth-server-url"?: string;
  "hosted-client-id"?: string;
  "hosted-resource"?: string;
  "hosted-scopes"?: string;
}

export interface ParsedGeneratorCliConfig {
  runtimeMode: RuntimeMode;
  upstreamHeaders: UpstreamHeaderConfig[];
  prompts?: PromptDefinition[];
  toolInstructions?: Record<string, ToolInstructionConfig>;
  hostedOauthConfig?: HostedOauthConfig;
}

export function parseGeneratorCliConfig(
  values: GenerateCliValues
): ParsedGeneratorCliConfig {
  return {
    runtimeMode: resolveRuntimeMode(values.mode, values.header),
    upstreamHeaders: parseUpstreamHeaders(values.header),
    prompts: parsePrompts(values["prompts-json"]),
    toolInstructions: parseToolInstructions(values["tool-instructions-json"]),
    hostedOauthConfig: parseHostedOauthConfig(values),
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
    prompts: parsed.prompts,
    toolInstructions: parsed.toolInstructions,
    hostedOauthConfig: parsed.hostedOauthConfig,
    hostedWorkerConfig:
      parsed.runtimeMode === "emcy_hosted_worker"
        ? baseOptions.hostedWorkerConfig ?? {}
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

export function parseHostedOauthConfig(
  values: GenerateCliValues
): HostedOauthConfig | undefined {
  const provider = clean(values["hosted-provider"]);
  const authorizationServerUrl = clean(values["hosted-auth-server-url"]);
  const clientId = clean(values["hosted-client-id"]);
  const resource = clean(values["hosted-resource"]);
  const scopes = parseScopes(values["hosted-scopes"]);

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

export function resolveRuntimeMode(
  mode: string | undefined,
  headerArgs: string[] | undefined
): RuntimeMode {
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
    normalized === "emcy-hosted-worker" ||
    normalized === "emcy_hosted_worker"
  ) {
    return "emcy_hosted_worker";
  }

  throw new Error(
    `Unsupported --mode "${mode}". Supported modes: standalone-no-auth, standalone-headers, emcy-hosted-worker`
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
