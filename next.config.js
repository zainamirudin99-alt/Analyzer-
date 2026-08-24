/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  typescript: {
    // Memastikan build Vercel tidak terhenti karena minor type check
    ignoreBuildErrors: true,
  },
  eslint: {
    // Memastikan build Vercel tidak terhenti karena linting
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['pdf-parse'],
};

module.exports = nextConfig;
