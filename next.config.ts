import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/finance",
  serverExternalPackages: ["better-sqlite3", "pdf-parse"],
};

export default nextConfig;
