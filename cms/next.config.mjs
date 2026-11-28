import { withPayload } from '@payloadcms/next/withPayload';
export default withPayload({
  agentRules: false,
  poweredByHeader: false,
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: { cpus: 2 },
  webpack(config) {
    // Share the website's SVG outlines while keeping ordinary SVG imports as images.
    const rawQuery = /^\?raw$/;
    const imageRule = config.module.rules.find(rule => rule?.loader === 'next-image-loader');
    imageRule.resourceQuery.not.push(rawQuery);
    config.module.rules.push({ resource: /\.svg$/i, resourceQuery: rawQuery, type: 'asset/source' });
    return config;
  },
});
