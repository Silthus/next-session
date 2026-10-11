import { test } from "@playwright/test";
import { signUpAccount } from "./helpers";

const productionBurst = 20;

test("the suite signs up more Accounts in a row than production's burst allows", async () => {
  for (let i = 0; i <= productionBurst; i++) await signUpAccount();
});
