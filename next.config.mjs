/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint is enforced separately (CI); don't let it block preview/prod builds.
  eslint: { ignoreDuringBuilds: true },
  // The Python connector lives in /connector and is not part of the Next build.
  outputFileTracingExcludes: {
    "*": ["./connector/**/*"],
  },
};

export default nextConfig;
