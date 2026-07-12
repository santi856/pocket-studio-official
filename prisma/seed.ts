try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional — CI and hosted environments inject vars directly.
}

/**
 * Populates platform-wide registries (Supported Capability Registry,
 * Plan Registry) that the app depends on but that no request path
 * creates on its own — these are Pocket Studio's own policy data, not
 * customer data, so nothing customer-facing should be responsible for
 * seeding them. Run once per environment: `npm run db:seed`.
 *
 * .env must be loaded before any of these modules are imported (they read
 * env at module-evaluation time via src/lib/db.ts), and ES module imports
 * are hoisted above this file's own top-level statements — so everything
 * after the .env load uses dynamic import() instead of static imports.
 */
async function main() {
  const { seedCapabilityRegistry } = await import("@/lib/registry/seed-data");
  const { seedPlans } = await import("@/lib/billing/seed-plans");

  console.log("Seeding capability registry...");
  await seedCapabilityRegistry();

  console.log("Seeding plan registry...");
  await seedPlans();

  console.log("Seed complete.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { db } = await import("@/lib/db");
    await db.$disconnect();
  });
