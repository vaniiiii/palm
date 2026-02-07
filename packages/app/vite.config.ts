import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/api": env.VITE_PROVE_API_URL?.replace("/api/prove", "") || "http://localhost:3001",
        "/indexer": {
          target: env.VITE_INDEXER_URL || "http://localhost:42069",
          rewrite: (path) => path.replace(/^\/indexer/, ""),
        },
      },
    },
  };
});
