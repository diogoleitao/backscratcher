/** @type {import('next').NextConfig} */
const nextConfig = {
  // The image optimiser caches into .next/cache at runtime, which would write
  // inside the installed package.
  images: { unoptimized: true },
};

export default nextConfig;
