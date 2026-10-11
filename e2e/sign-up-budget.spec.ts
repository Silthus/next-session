import { expect, test } from "@playwright/test";
import { ConvexError } from "convex/values";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { convexUrl, password, signUpAccount } from "./helpers";

const productionBurst = 20;

async function signUpWithoutReserving() {
  const client = new ConvexHttpClient(convexUrl);
  const email = `drain-${crypto.randomUUID()}@example.test`;
  await client.action(api.auth.signIn, {
    provider: "password",
    params: { email, password, flow: "signUp" },
  });
}

async function drainAccountSignUpBudget() {
  for (let i = 0; i <= productionBurst; i++) {
    try {
      await signUpWithoutReserving();
    } catch (error) {
      if (error instanceof ConvexError) return error.data as unknown;
      throw error;
    }
  }
  throw new Error("The sign-up budget never ran out");
}

test("a new Account signs up even after the sign-up budget ran out", async () => {
  expect(await drainAccountSignUpBudget()).toMatchObject({ code: "RATE_LIMITED" });

  await signUpAccount();
});
