import { NextResponse } from "next/server";
import { requireCurrentUser, UnauthenticatedError } from "@/lib/auth/current-user";
import { resolveProjectForRoute } from "@/lib/web/resolve-project";
import { getLatestProductDNA } from "@/lib/product/product-dna";
import { generateManifest } from "@/lib/generation/pwa";

/**
 * A real, project-scoped Web App Manifest (Master Spec §40) — gated by the
 * same platform session/tenant checks as every other project route, since
 * this lives under the authenticated Studio area, not a public storefront.
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
  const productDNA = await getLatestProductDNA(user.id, project.id);

  const manifest = generateManifest(project, orgSlug, productDNA);

  return NextResponse.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
