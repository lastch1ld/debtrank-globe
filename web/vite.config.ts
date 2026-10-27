import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { thirdPartyNotices } from "./build/thirdPartyNotices.ts";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/debtrank-globe/" : "/",
  plugins: [react(), tailwindcss(), thirdPartyNotices()],
}));
