import { NextResponse } from "next/server";
import { requireCurrentUser, UnauthenticatedError } from "@/lib/auth/current-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { exportProject } from "@/lib/generation/export";
import { ExportNotAllowedError } from "@/lib/billing/entitlements";

/**
 * Master Spec §6 Simple Mode: "export or prepare for launch." Streams the
 * real structured export bundle (P2-13's exportProject — Product State/
 * DNA/Blueprint/Build Plan/GeneratedRecords/generated-app users/policy
 * drafts/Governance Profile/Truth Status, never credentials) as a
 * downloadable JSON file. Gated by the same platform session/tenant checks
 * as every other project route, mirroring manifest.webmanifest/sw.js
 * (P2-14).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgSlug: string; projectSlug: string }> },
) {
  const { orgSlug, projectSlug } = await params;

  let user;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    throw error;
  }

  const { project } = await resolveProjectForRoute(user.id, orgSlug, projectSlug);

  let bundle;
  try {
    bundle = await exportProject(user.id, project.id);
  } catch (error) {
    if (error instanceof ExportNotAllowedError) {
      return new NextResponse(error.message, { status: 403 });
    }
    throw error;
  }

  return NextResponse.json(bundle, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${projectSlug}-export.json"`,
    },
  });
}
