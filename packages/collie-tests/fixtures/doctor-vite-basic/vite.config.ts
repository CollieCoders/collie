import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { collie } from "@collie-lang/vite";

export default defineConfig({
  plugins: [react(), collie()]
});
