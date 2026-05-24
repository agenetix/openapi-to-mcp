import { createHash } from "node:crypto";

export const CURRENT_TOOL_NAMING_VERSION = 2;
export const MAX_TOOL_KEY_LENGTH = 128;
export const MAX_MCP_TOOL_NAME_LENGTH = 64;
const HASH_LENGTH = 8;

export function buildToolKey(method: string, path: string): string {
  const tokens = [normalizeToken(method)];

  for (const rawSegment of path.split("/").filter(Boolean)) {
    const segment = rawSegment.trim();
    if (segment.startsWith("{") && segment.endsWith("}") && segment.length > 2) {
      tokens.push(`by_${normalizeToken(segment.slice(1, -1))}`);
      continue;
    }

    tokens.push(normalizeToken(segment));
  }

  const combined = tokens.filter(Boolean).join("_") || "tool";
  return withDeterministicHashSuffix(combined, MAX_TOOL_KEY_LENGTH);
}

export function buildMcpToolName(
  operationId: string | undefined,
  method: string,
  path: string,
): string {
  const source = operationId && operationId.trim().length > 0
    ? splitIdentifierWords(operationId)
    : buildToolKey(method, path);
  return withDeterministicHashSuffix(normalizeToken(source), MAX_MCP_TOOL_NAME_LENGTH);
}

export function buildDisplayName(operationId: string | undefined, method: string, path: string): string {
  if (operationId && operationId.trim().length > 0) {
    return operationId.trim();
  }

  const methodPart = capitalize(method.trim().toLowerCase());
  const segmentParts = path
    .split("/")
    .filter(Boolean)
    .flatMap((rawSegment) => {
      const segment = rawSegment.trim();
      if (segment.startsWith("{") && segment.endsWith("}") && segment.length > 2) {
        return ["By", capitalizeWords(segment.slice(1, -1))];
      }

      return [capitalizeWords(segment)];
    });

  return [methodPart, ...segmentParts].join("") || methodPart;
}

export function buildWorkspaceToolName(serverSlug: string, toolKey: string): string {
  return withDeterministicHashSuffix(`${normalizeToken(serverSlug)}__${toolKey}`, MAX_TOOL_KEY_LENGTH);
}

function normalizeToken(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "part";
}

function splitIdentifierWords(value: string): string {
  return value
    .trim()
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2");
}

function withDeterministicHashSuffix(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const hash = createHash("sha256").update(value).digest("hex").slice(0, HASH_LENGTH);
  const prefixLength = Math.max(1, maxLength - HASH_LENGTH - 1);
  const prefix = value.slice(0, prefixLength).replace(/_+$/g, "") || value.slice(0, prefixLength);
  return `${prefix}_${hash}`;
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function capitalizeWords(value: string): string {
  return value
    .trim()
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean)
    .map((part) => capitalize(part.toLowerCase()))
    .join("");
}
