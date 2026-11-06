import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { commissionPlugin } from './server/commissions.mjs';

export default defineConfig({
  plugins: [react(), commissionPlugin()],
  preview: {
    allowedHosts: ["funil-dashboard.72.60.147.19.sslip.io", "luiz-dashboard.72.60.147.19.sslip.io"],
  },
});
