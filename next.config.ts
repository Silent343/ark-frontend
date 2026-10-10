import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { proxyClientMaxBodySize: "32mb" },
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    // Resolve the local preview before AuthProvider renders the normal login screen.
    return process.env.ARK_LOCAL_PREVIEW === "1"
      ? [{ source: "/", destination: "/preview", permanent: false }]
      : [];
  },
  async rewrites() {
    const api = (process.env.TELURIA_API_URL ??
      (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : ""))
      .replace(/\/$/, "");
    if (!api) throw new Error("TELURIA_API_URL is required for the frontend build.");
    return {
      beforeFiles: [
        { source: "/api/v1/:path*", destination: `${api}/api/v1/:path*` },
        { source: "/api/health", destination: `${api}/api/health` },
      ],
    };
  },
};

export default nextConfig;
