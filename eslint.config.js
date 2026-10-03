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
    ".wrangler/",
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  { files: ["**/*.js"], extends: [tseslint.configs.disableTypeChecked] },
  { files: ["src/**"], languageOptions: { globals: globals.browser } },
  { files: ["scripts/**", "e2e/**", "*.{js,ts}"], languageOptions: { globals: globals.node } },
  { files: ["src/**/*.{ts,tsx}"], extends: [reactHooks.configs.flat.recommended] },
  { files: ["convex/**/*.ts"], extends: [convexPlugin.configs.recommended] },
);
