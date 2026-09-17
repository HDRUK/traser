import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  envDir: false,
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    include: ["ajv", "ajv-formats", "jsonata"],
  },
  server: {
    port: parseInt(process.env.PORT ?? "3001"),
    strictPort: false,
    watch: {
      // Prevent SSR reloads when dataset cache files change
      ignored: ["**/data/**"],
    },
  },
  ssr: {
    noExternal: [
      "@mui/material",
      "@mui/icons-material",
      "@mui/system",
      "@mui/utils",
      "@emotion/react",
      "@emotion/styled",
      "@emotion/cache",
    ],
    // CJS-only packages: let Node resolve them natively rather than having
    // Vite attempt to bundle them as ESM (which fails with "exports is not defined")
    external: ["ajv", "ajv-formats", "jsonata", "react-transition-group"],
  },
});
