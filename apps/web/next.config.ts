import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Admin pages are DB-driven and always dynamic; keep the simpler caching model.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  transpilePackages: ["@bb/db", "@bb/shared"],
  // Export libraries use native modules / their own reconciler; keep them out of the bundle.
  serverExternalPackages: ["@react-pdf/renderer", "sharp", "exceljs"],
  // PDF fonts are read from disk at runtime; include them in the standalone output.
  outputFileTracingIncludes: { "/**/*": ["./assets/fonts/*.ttf"] },
};

export default nextConfig;
