import "server-only";
import ts from "typescript";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/tenancy/authz";
import { getLatestBlueprint } from "./blueprint";
import { setTruthStatus } from "@/lib/product/truth-status";
import type { Project } from "@/generated/prisma/client";

/**
 * Master Spec §41: "Pocket Studio must select and document an official
 * supported mobile strategy, such as React Native with Expo or another
 * justified architecture." React Native + Expo — Master Spec's own
 * suggested example — chosen for the same reason every other Phase 2
 * generation decision has been made deterministically and transparently:
 * it is well-precedented, has a real TypeScript toolchain this build can
 * actually validate against, and does not require this environment to
 * have a native iOS/Android build toolchain (which it does not — no
 * Xcode, no Android SDK).
 *
 * This module produces a real, minimal Expo project *scaffold* — not a
 * feature-complete mobile app. It reuses the Blueprint's own screen list
 * (P2-01) rather than a second, divergent design system; a full mobile
 * Structured Renderer / Interactive Runtime equivalent to P2-05 does not
 * exist yet (disclosed as a known limitation, not implemented here).
 * "Build validation" is honestly scoped to a syntax check of the
 * generated TypeScript/TSX — not a full type-check against React
 * Native's ambient type declarations (not installed in this repo) and
 * never a real native .ipa/.apk build, which this environment cannot
 * produce.
 */

export const MOBILE_ARCHITECTURE = "react-native-expo" as const;

export type MobileProjectFile = { path: string; content: string };

type BlueprintLike = { screens: unknown; roles: unknown };

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toExpoSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "app"
  );
}

/**
 * Deterministically produces the minimal set of files a real Expo project
 * needs to exist and be inspected: `app.json` (Expo config), `package.json`
 * (real, minimal dependency list), `tsconfig.json`, and `App.tsx` — a
 * static navigation-list scaffold naming every Blueprint screen, not a
 * full per-screen interactive implementation.
 */
export function generateMobileProjectFiles(
  project: Pick<Project, "name" | "slug">,
  blueprint: BlueprintLike,
): MobileProjectFile[] {
  const screens = asStringArray(blueprint.screens);
  const slug = toExpoSlug(project.slug || project.name);

  const appJson = {
    expo: {
      name: project.name,
      slug,
      version: "1.0.0",
      platforms: ["ios", "android"],
      orientation: "portrait",
    },
  };

  const packageJson = {
    name: slug,
    version: "1.0.0",
    private: true,
    main: "node_modules/expo/AppEntry.js",
    dependencies: {
      expo: "~52.0.0",
      react: "18.3.1",
      "react-native": "0.76.0",
    },
    devDependencies: {
      typescript: "^5",
      "@types/react": "~18.3.0",
    },
  };

  const tsconfigJson = {
    extends: "expo/tsconfig.base",
    compilerOptions: { strict: true },
  };

  const screenListEntries = screens
    .map((screen) => `        <Text key="${screen}" style={styles.item}>${screen}</Text>`)
    .join("\n");

  const appTsx = `import { StyleSheet, Text, View } from "react-native";

/**
 * Generated navigation scaffold for "${project.name}" — lists every screen
 * the current Blueprint defines. This is a starting structure, not a
 * feature-complete mobile app: per-screen interactive rendering
 * equivalent to the web Structured Renderer (P2-05) does not exist yet.
 */
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>${project.name}</Text>
${screenListEntries}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64, paddingHorizontal: 16 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 16 },
  item: { fontSize: 16, paddingVertical: 8 },
});
`;

  return [
    { path: "app.json", content: JSON.stringify(appJson, null, 2) },
    { path: "package.json", content: JSON.stringify(packageJson, null, 2) },
    { path: "tsconfig.json", content: JSON.stringify(tsconfigJson, null, 2) },
    { path: "App.tsx", content: appTsx },
  ];
}

export type MobileProjectValidationResult = { valid: boolean; errors: string[] };

/**
 * "Build validation" (§41), honestly scoped: JSON files must parse; `.tsx`
 * files must be syntactically valid TypeScript/JSX per the TypeScript
 * compiler's own parser. This is real validation — a genuinely malformed
 * file fails it — but it is not a full type-check (React Native's ambient
 * types are not installed in this repo) and never a native build.
 */
export function validateMobileProjectFiles(
  files: MobileProjectFile[],
): MobileProjectValidationResult {
  const errors: string[] = [];

  for (const file of files) {
    if (file.path.endsWith(".json")) {
      try {
        JSON.parse(file.content);
      } catch {
        errors.push(`"${file.path}" is not valid JSON.`);
      }
      continue;
    }
    if (file.path.endsWith(".tsx") || file.path.endsWith(".ts")) {
      const sourceFile = ts.createSourceFile(
        file.path,
        file.content,
        ts.ScriptTarget.Latest,
        true,
        file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const syntaxErrors = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] })
        .parseDiagnostics;
      if (syntaxErrors && syntaxErrors.length > 0) {
        for (const diagnostic of syntaxErrors) {
          errors.push(
            `"${file.path}": ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export class NoBlueprintForMobileProjectError extends Error {
  constructor() {
    super("This project has no Blueprint yet — nothing to generate a mobile project from.");
    this.name = "NoBlueprintForMobileProjectError";
  }
}

export type GeneratedMobileProject = {
  architecture: typeof MOBILE_ARCHITECTURE;
  basedOnBlueprintVersion: number;
  files: MobileProjectFile[];
  validation: MobileProjectValidationResult;
  generationMetadata: { generatedBy: string; generatedAt: string; method: string };
};

/**
 * Generates the mobile project scaffold and syncs Truth Status for
 * `output.ios`/`output.android` to reflect exactly this outcome — a
 * syntax-validated scaffold, not a built or store-ready application.
 * Note (disclosed, not silently true): a later `generateApplication` call
 * (P2-06/P2-14) resets these two subject keys to `NOT_EVALUATED` on every
 * web regeneration, since the two are not currently coupled — calling
 * this function again after a web edit re-establishes the accurate status.
 */
export async function generateMobileProject(
  actorUserId: string,
  projectId: string,
): Promise<GeneratedMobileProject> {
  await requireProjectAccess(actorUserId, projectId, "MEMBER");

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true, slug: true },
  });
  const blueprint = await getLatestBlueprint(actorUserId, projectId);
  if (!blueprint) {
    throw new NoBlueprintForMobileProjectError();
  }

  const files = generateMobileProjectFiles(project, blueprint);
  const validation = validateMobileProjectFiles(files);

  const status = validation.valid ? "IMPLEMENTED" : "BLOCKED";
  const rationale = validation.valid
    ? `A ${MOBILE_ARCHITECTURE} project scaffold was generated and passed syntax validation; no native build, signing, or store submission exists.`
    : `Scaffold generation produced invalid files: ${validation.errors.join("; ")}`;

  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "output.ios",
    subjectLabel: "Native iOS output",
    status,
    rationale,
  });
  await setTruthStatus(actorUserId, projectId, {
    subjectKey: "output.android",
    subjectLabel: "Native Android output",
    status,
    rationale,
  });

  return {
    architecture: MOBILE_ARCHITECTURE,
    basedOnBlueprintVersion: blueprint.version,
    files,
    validation,
    generationMetadata: {
      generatedBy: "deterministic-mobile-scaffold-generator-v1",
      generatedAt: new Date().toISOString(),
      method:
        "Derived from the current Blueprint's screen list; a static navigation scaffold, not a full interactive mobile runtime.",
    },
  };
}
