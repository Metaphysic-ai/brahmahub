import { execFileSync } from "node:child_process";
import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// Get version from git tags
// Format: v1.2.0 (on tag) or v1.2.0-3-gabc1234 (3 commits after tag) or abc1234 (no tags)
function getGitVersion(): string {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  try {
    return execFileSync("git", ["describe", "--tags", "--always", "--dirty"], {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "dev";
  }
}

function getGitCommit(): string {
  if (process.env.VITE_APP_COMMIT) return process.env.VITE_APP_COMMIT;
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "unknown";
  }
}

const VERSION = getGitVersion();
const COMMIT = getGitCommit();
const BUILD_DATE = process.env.VITE_APP_BUILD_DATE || new Date().toISOString();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(VERSION),
    __APP_COMMIT__: JSON.stringify(COMMIT),
    __APP_BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/media": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  optimizeDeps: {
    include: ["@tanstack/react-query"],
  },
});
