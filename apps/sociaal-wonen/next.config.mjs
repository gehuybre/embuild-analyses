// Een lege NEXT_PUBLIC_BASE_PATH is geldig (standalone build). Daarom hasOwnProperty en geen `||`.
const basePath = Object.prototype.hasOwnProperty.call(process.env, 'NEXT_PUBLIC_BASE_PATH')
  ? process.env.NEXT_PUBLIC_BASE_PATH
  : '/analyses/sociaal-wonen';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
  pageExtensions: ['tsx', 'ts'],
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_DEPLOY_VERSION: process.env.NEXT_PUBLIC_DEPLOY_VERSION || '',
  },
  transpilePackages: ['@embuild/shared'],
};

export default nextConfig;
