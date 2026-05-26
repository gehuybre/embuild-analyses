const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/analyses/vacatures';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_DEPLOY_VERSION: process.env.NEXT_PUBLIC_DEPLOY_VERSION || '',
  },
  transpilePackages: ['@embuild/shared'],
};

export default nextConfig;
