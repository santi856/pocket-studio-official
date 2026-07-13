import "server-only";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestBlueprint } from "./blueprint";
import { setTruthStatus } from "@/lib/product/truth-status";
import type { Project, ProductDNA } from "@/generated/prisma/client";

/**
 * Master Spec §40: "PWA output may include: manifest; icons;
 * installability; service worker; caching; update behavior; offline
 * behavior where appropriate; push architecture where supported." A real,
 * minimal, valid Web App Manifest — no fabricated icon set exists yet, so
 * `icons` honestly references the platform's own existing favicon rather
 * than inventing per-product icon assets; real installability (icon sizing
 * requirements, a Lighthouse audit, HTTPS in production) is not verified
 * by this build and is disclosed as a known limitation, not claimed.
 */
export type WebAppManifest = {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: "standalone";
  theme_color: string;
  background_color: string;
  icons: Array<{ src: string; sizes: string; type: string }>;
};

export function generateManifest(
  project: Pick<Project, "name" | "slug">,
  orgSlug: string,
  productDNA: Pick<ProductDNA, "purpose"> | null,
): WebAppManifest {
  const name = productDNA?.purpose?.trim() || project.name;
  return {
    name,
    short_name: name.length > 30 ? `${name.slice(0, 27)}...` : name,
    start_url: `/org/${orgSlug}/${project.slug}`,
    scope: `/org/${orgSlug}/${project.slug}`,
    display: "standalone",
    theme_color: "#000000",
    background_color: "#ffffff",
    icons: [{ src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
  };
}

/**
 * Master Spec §39: "Track each output target independently... Completion
 * on one target is not evidence for another." Reuses the existing Truth
 * Status mechanism (TruthStatusEntry) rather than a new schema/enum for
 * §39's richer status vocabulary (requested/generated/tested/built/
 * signed/uploaded/submitted/approved/released/operational/...) — that
 * detail is captured in `rationale` (free text), which is proportional to
 * what this build can honestly support today rather than inventing a
 * parallel 14-value status enum this codebase cannot yet populate
 * meaningfully.
 */
export async function syncOutputTargetStatus(
  actorUserId: string,
  projectId: string,
): Promise<void> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const blueprint = await getLatestBlueprint(actorUserId, projectId);

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "output.web",
    subjectLabel: "Responsive web output",
    status: blueprint ? "IMPLEMENTED" : "MISSING",
    rationale: blueprint
      ? `Generated and live at a real preview route (P2-06); not built, signed, or deployed to a production domain.`
      : "No Blueprint has been generated yet.",
  });

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "output.pwa",
    subjectLabel: "Progressive Web Application output",
    status: blueprint ? "IMPLEMENTED" : "MISSING",
    rationale: blueprint
      ? "A real manifest and minimal service worker are served for this project; real installability (icon sizing, Lighthouse audit, HTTPS) has not been verified."
      : "No Blueprint has been generated yet.",
  });

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "output.ios",
    subjectLabel: "Native iOS output",
    status: "NOT_EVALUATED",
    rationale: "Native mobile output is not yet implemented (P2-15).",
  });

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "output.android",
    subjectLabel: "Native Android output",
    status: "NOT_EVALUATED",
    rationale: "Native mobile output is not yet implemented (P2-15).",
  });
}
