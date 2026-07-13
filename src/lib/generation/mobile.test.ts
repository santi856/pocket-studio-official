import { describe, expect, it } from "vitest";
import { generateMobileProjectFiles, validateMobileProjectFiles } from "./mobile";

describe("generateMobileProjectFiles", () => {
  const project = { name: "Booking App", slug: "booking-app" };

  it("generates a real, minimal Expo project structure", () => {
    const files = generateMobileProjectFiles(project, { screens: ["Home", "Browse"], roles: [] });

    const paths = files.map((f) => f.path);
    expect(paths).toEqual(["app.json", "package.json", "tsconfig.json", "App.tsx"]);

    const appJson = JSON.parse(files.find((f) => f.path === "app.json")!.content);
    expect(appJson.expo.name).toBe("Booking App");
    expect(appJson.expo.platforms).toEqual(["ios", "android"]);

    const packageJson = JSON.parse(files.find((f) => f.path === "package.json")!.content);
    expect(packageJson.dependencies.expo).toBeTruthy();
    expect(packageJson.dependencies["react-native"]).toBeTruthy();
  });

  it("reflects the Blueprint's real screen names in App.tsx, not invented ones", () => {
    const files = generateMobileProjectFiles(project, { screens: ["Home", "Checkout"], roles: [] });

    const appTsx = files.find((f) => f.path === "App.tsx")!.content;
    expect(appTsx).toContain("Home");
    expect(appTsx).toContain("Checkout");
  });

  it("produces a URL-safe Expo slug from the project slug", () => {
    const files = generateMobileProjectFiles(
      { name: "Weird Name!!", slug: "Weird Name!!" },
      { screens: [], roles: [] },
    );
    const appJson = JSON.parse(files.find((f) => f.path === "app.json")!.content);
    expect(appJson.expo.slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("validateMobileProjectFiles", () => {
  const project = { name: "Booking App", slug: "booking-app" };

  it("is valid for the output of generateMobileProjectFiles", () => {
    const files = generateMobileProjectFiles(project, { screens: ["Home"], roles: [] });
    const result = validateMobileProjectFiles(files);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("detects invalid JSON", () => {
    const result = validateMobileProjectFiles([{ path: "app.json", content: "{not valid json" }]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("app.json");
  });

  it("detects genuinely malformed TypeScript/TSX", () => {
    const result = validateMobileProjectFiles([
      { path: "App.tsx", content: "export default function App() { return <View>}}}" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
