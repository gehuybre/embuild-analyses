/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_DEPLOY_VERSION: process.env.NEXT_PUBLIC_DEPLOY_VERSION || '',
  },
  transpilePackages: ['@embuild/shared'],
};

export default nextConfig;
