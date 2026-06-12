/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Python connector lives in /connector and is not part of the Next build.
  outputFileTracingExcludes: {
    "*": ["./connector/**/*"],
  },
};

export default nextConfig;
