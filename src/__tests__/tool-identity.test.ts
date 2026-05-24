import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildDisplayName,
  buildMcpToolName,
  buildToolKey,
  buildWorkspaceToolName,
  MAX_TOOL_KEY_LENGTH,
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

  it("keeps generated tool names within leading hosted-client limits", () => {
    const longToolKeys = [
      buildToolKey("POST", "/api/organizations/current/invitations/{invitationId}/resend"),
      buildToolKey("POST", "/api/organizations/current/invitations/{invitationId}/revoke"),
      buildToolKey(
        "GET",
        "/segment-0/segment-1/segment-2/segment-3/segment-4/segment-5/segment-6/segment-7/segment-8/segment-9/segment-10/segment-11/segment-12/segment-13/segment-14/segment-15/segment-16/segment-17/segment-18/segment-19/segment-20/segment-21/segment-22/segment-23/segment-24/segment-25/segment-26/segment-27/segment-28/segment-29",
      ),
    ];

    for (const toolKey of longToolKeys) {
      expect(toolKey.length).toBeLessThanOrEqual(MAX_TOOL_KEY_LENGTH);
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
