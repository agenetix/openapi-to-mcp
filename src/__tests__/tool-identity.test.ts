import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDisplayName,
  buildMcpToolName,
  buildToolKey,
  buildWorkspaceToolName,
  MAX_MCP_TOOL_NAME_LENGTH,
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

  it("prefers operationId-based MCP tool names for hosted client compatibility", () => {
    expect(buildMcpToolName("rename_checklist", "PATCH", "/api/checklists/{id}")).toBe(
      "rename_checklist",
    );
    expect(buildMcpToolName("resendOrganizationInvitation", "POST", "/api/organizations/current/invitations/{invitationId}/resend")).toBe(
      "resend_organization_invitation",
    );
  });

  it("keeps exposed MCP tool names within hosted client limits", () => {
    const name = buildMcpToolName(
      undefined,
      "POST",
      "/api/organizations/current/invitations/{invitationId}/resend",
    );

    expect(name.length).toBeLessThanOrEqual(MAX_MCP_TOOL_NAME_LENGTH);
    expect(name).toMatch(/^post_api_organizations_current_invitations_by_invitatio_[a-f0-9]{8}$/);
  });
});
