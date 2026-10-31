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
};

export default nextConfig;
