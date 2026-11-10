import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.VITE_DEV_API_URL || "http://localhost:3001",
    },
  },
});
