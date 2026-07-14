// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetDatabase } from "../../../test/reset-db";
import { registerUser } from "@/lib/services/users";
import { createOrganization } from "@/lib/services/organizations";
import { createProject } from "@/lib/services/projects";
import { upsertIntegrationRequirement } from "@/lib/product/integrations";
import { createGeneratedAppUser } from "./generated-app-users";
import { ForbiddenError } from "@/lib/tenancy/authz";
import { IntegrationRequirementNotFoundError } from "@/lib/credentials/vault";
import {
  createGeneratedAppCharge,
  InvalidChargeAmountError,
  listGeneratedAppPayments,
  PaymentIntegrationNotConnectedError,
} from "./generated-app-payments";

describe("Generated-app payments (mock provider — default env)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await db.$disconnect();
  });

  async function seedProjectWithConnectedPayments() {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const outsider = await registerUser({ email: "outsider@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    const requirement = await upsertIntegrationRequirement(owner.id, project.id, {
      category: "payments",
      purpose: "Collect deposits",
      requirementLevel: "REQUIRED",
      owner: "CUSTOMER",
      connectionStatus: "CONNECTED",
    });
    const endUser = await createGeneratedAppUser(owner.id, project.id, {
      email: "customer@example.com",
      password: "correcthorsebatterystaple",
      role: "customer",
    });
    return { owner, outsider, project, requirement, endUser };
  }

  it("creates a real, SUCCEEDED payment record for a valid charge", async () => {
    const { owner, project, requirement, endUser } = await seedProjectWithConnectedPayments();

    const payment = await createGeneratedAppCharge(project.id, {
      integrationRequirementId: requirement.id,
      generatedAppUserId: endUser.id,
      amountCents: 5000,
      description: "Appointment deposit",
    });

    expect(payment.status).toBe("SUCCEEDED");
    expect(payment.amountCents).toBe(5000);
    expect(payment.currency).toBe("usd");
    expect(payment.providerChargeId).toBeTruthy();

    const stored = await db.generatedAppPayment.findUnique({ where: { id: payment.id } });
    expect(stored).not.toBeNull();

    const history = await listGeneratedAppPayments(owner.id, project.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe(payment.id);
  });

  it("rejects a non-positive amount without creating a payment row", async () => {
    const { owner, project, requirement } = await seedProjectWithConnectedPayments();

    await expect(
      createGeneratedAppCharge(project.id, {
        integrationRequirementId: requirement.id,
        amountCents: 0,
        description: "Invalid",
      }),
    ).rejects.toBeInstanceOf(InvalidChargeAmountError);

    expect(await listGeneratedAppPayments(owner.id, project.id)).toHaveLength(0);
  });

  it("rejects a non-integer amount", async () => {
    const { project, requirement } = await seedProjectWithConnectedPayments();

    await expect(
      createGeneratedAppCharge(project.id, {
        integrationRequirementId: requirement.id,
        amountCents: 49.99,
        description: "Invalid",
      }),
    ).rejects.toBeInstanceOf(InvalidChargeAmountError);
  });

  it("throws IntegrationRequirementNotFoundError for a nonexistent requirement", async () => {
    const { project } = await seedProjectWithConnectedPayments();

    await expect(
      createGeneratedAppCharge(project.id, {
        integrationRequirementId: "not-a-real-id",
        amountCents: 100,
        description: "x",
      }),
    ).rejects.toBeInstanceOf(IntegrationRequirementNotFoundError);
  });

  it("throws PaymentIntegrationNotConnectedError when the requirement is not connected", async () => {
    const owner = await registerUser({ email: "owner@example.com", password: "password123" });
    const org = await createOrganization({ name: "Detailer Co", ownerUserId: owner.id });
    const project = await createProject({
      organizationId: org.id,
      name: "Booking App",
      createdByUserId: owner.id,
    });
    const requirement = await upsertIntegrationRequirement(owner.id, project.id, {
      category: "payments",
      purpose: "Collect deposits",
      requirementLevel: "REQUIRED",
      owner: "CUSTOMER",
      connectionStatus: "SETUP_NEEDED",
    });

    await expect(
      createGeneratedAppCharge(project.id, {
        integrationRequirementId: requirement.id,
        amountCents: 100,
        description: "x",
      }),
    ).rejects.toBeInstanceOf(PaymentIntegrationNotConnectedError);
  });

  it("denies payment history access for a non-member (tenant isolation)", async () => {
    const { outsider, project, requirement } = await seedProjectWithConnectedPayments();
    await createGeneratedAppCharge(project.id, {
      integrationRequirementId: requirement.id,
      amountCents: 100,
      description: "x",
    });

    await expect(listGeneratedAppPayments(outsider.id, project.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("returns payment history newest first", async () => {
    const { owner, project, requirement } = await seedProjectWithConnectedPayments();
    await createGeneratedAppCharge(project.id, {
      integrationRequirementId: requirement.id,
      amountCents: 100,
      description: "first",
    });
    await createGeneratedAppCharge(project.id, {
      integrationRequirementId: requirement.id,
      amountCents: 200,
      description: "second",
    });

    const history = await listGeneratedAppPayments(owner.id, project.id);
    expect(history.map((p) => p.description)).toEqual(["second", "first"]);
  });
});
