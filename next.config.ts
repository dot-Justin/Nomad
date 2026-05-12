import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["better-sqlite3-multiple-ciphers", "ssh2"],
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        ...(Array.isArray(config.watchOptions?.ignored)
          ? config.watchOptions.ignored
          : []),
        "**/.playwright-mcp/**",
        "**/node_modules/**",
        "**/lib/**",
        "**/server.js",
        "**/*.db",
        "**/*.log",
      ],
    };
    return config;
  },
};

export default nextConfig;
