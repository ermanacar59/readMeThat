import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(process.cwd(), "../.."), "");
  const backendTarget = env.VITE_BACKEND_TARGET || "http://127.0.0.1:5061";
  return {
    plugins: [react()],
    envDir: "../../",
    server: {
      host: "127.0.0.1",
      port: Number(env.WEB_PORT || 4173),
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true
        },
        "/health": {
          target: backendTarget,
          changeOrigin: true
        }
      }
    }
  };
});
