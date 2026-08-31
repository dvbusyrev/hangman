import { defineConfig } from "vite";

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium")
  },
  build: {
    chunkSizeWarningLimit: 1200
  }
});
