import convexPlugin from "@convex-dev/eslint-plugin";
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "dist/",
    ".convex/",
    "convex/_generated/",
    "src/routeTree.gen.ts",
    "playwright-report/",
    "test-results/",
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  { files: ["**/*.js"], extends: [tseslint.configs.disableTypeChecked] },
  { files: ["src/**/*.{ts,tsx}"], extends: [reactHooks.configs.flat.recommended] },
  { files: ["convex/**/*.ts"], extends: [convexPlugin.configs.recommended] },
);
