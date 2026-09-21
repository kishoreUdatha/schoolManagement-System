/** @type {import('next').NextConfig} */

// The browser talks to /api on this app; Next forwards it to FastAPI. Same
// origin, so no CORS setup, and the backend address lives in one place.
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

module.exports = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }];
  },
};
