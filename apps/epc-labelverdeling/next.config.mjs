import createMDX from '@next/mdx'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/analyses/epc-labelverdeling';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
  pageExtensions: ['tsx', 'ts', 'mdx'],
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_DEPLOY_VERSION: process.env.NEXT_PUBLIC_DEPLOY_VERSION || '',
  },
  transpilePackages: ['@embuild/shared'],
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

export default withMDX(nextConfig);
