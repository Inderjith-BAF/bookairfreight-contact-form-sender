import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/submit": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
