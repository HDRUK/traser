import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
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
      "react-transition-group",
    ],
    // ajv, ajv-formats, jsonata are CJS — keep them external so Node
    // resolves them natively via package.json#main (dist/ajv.js etc.)
    external: ["ajv", "ajv-formats", "jsonata"],
  },
});
