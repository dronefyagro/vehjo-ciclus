import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["pdfjs-dist"],
  outputFileTracingIncludes: {
    "/api/card-invoice": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/api/bank-statement": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    return [
      { source: "/", headers: [...securityHeaders, { key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      { source: "/api/:path*", headers: [...securityHeaders, { key: "Cache-Control", value: "private, no-store, max-age=0" }] },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
