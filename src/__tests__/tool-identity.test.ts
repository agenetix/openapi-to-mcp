import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDisplayName,
  buildToolKey,
  buildWorkspaceToolName,
} from "../tool-identity.js";

interface ToolNamingFixture {
  method: string;
  path: string;
  operationId: string | null;
  serverSlug: string;
  toolKey: string;
  displayName: string;
  workspaceToolName: string;
}

const fixtures = JSON.parse(
  readFileSync(new URL("../../fixtures/tool-naming-fixtures.json", import.meta.url), "utf8"),
) as ToolNamingFixture[];

describe("tool identity", () => {
  it("matches the shared fixtures", () => {
    expect(fixtures.length).toBeGreaterThan(0);

    for (const fixture of fixtures) {
      expect(buildToolKey(fixture.method, fixture.path)).toBe(fixture.toolKey);
      expect(buildDisplayName(fixture.operationId ?? undefined, fixture.method, fixture.path)).toBe(
        fixture.displayName,
      );
      expect(buildWorkspaceToolName(fixture.serverSlug, fixture.toolKey)).toBe(
        fixture.workspaceToolName,
      );
    }
  });
});
