import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const heicToEntry = path.resolve(rootDir, "node_modules/heic-to/dist/heic-to.js");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "heic-to": heicToEntry,
    },
  },
  optimizeDeps: {
    // Large libheif bundle with inlined worker; pre-bundling often fails in dev.
    exclude: ["heic-to"],
    include: ["xlsx"],
  },
  server: {
    port: 5173,
    strictPort: false,
    open: true,
    host: true,
  },
});
