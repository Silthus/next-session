import { realpathSync } from "node:fs";
import posthogSourceMaps from "@posthog/rollup-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

function sourceMapUpload(env: NodeJS.ProcessEnv): PluginOption {
  const { POSTHOG_PERSONAL_API_KEY: personalApiKey, POSTHOG_PROJECT_ID: projectId } = env;
  if (!personalApiKey || !projectId) return null;
  return posthogSourceMaps({
    personalApiKey,
    projectId,
    host: "https://eu.i.posthog.com",
    sourcemaps: {
      releaseName: "next-session-web",
      releaseVersion: env.VITE_RELEASE,
      deleteAfterUpload: true,
    },
  });
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    sourceMapUpload(process.env),
  ],
  ...(process.env.E2E_BASE_URL
    ? {
        cacheDir: ".vite",
        server: { fs: { allow: [process.cwd(), realpathSync("node_modules")] } },
      }
    : {}),
  envPrefix: ["VITE_", "LEGAL_"],
  build: { target: "es2022" },
});
