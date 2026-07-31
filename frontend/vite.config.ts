import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ["Chrome >= 64", "Edge >= 79"],
      modernPolyfills: true,
      renderLegacyChunks: true
    })
  ],
  build: {
    target: "es2018"
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      },
      "/socket.io": {
        target: "http://127.0.0.1:3333",
        ws: true
      }
    }
  }
});
