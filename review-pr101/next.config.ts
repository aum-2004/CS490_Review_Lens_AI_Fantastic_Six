import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  logging: {
    // Auth actions receive credentials; confirmation URLs contain one-time tokens.
    serverFunctions: false,
    incomingRequests: {
      ignore: [/^\/auth\/confirm(?:[/?]|$)/, /^\/api\/ingestion\/provider-callback(?:[/?]|$)/],
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
