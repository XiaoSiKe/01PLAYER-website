import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createCommunityApi } from './server/community-api.mjs';
import { serveEditorial } from './server/editorial-snapshot.mjs';
import { serveEarthGuide } from './server/earth-guide.mjs';
import { previewBridgeKey } from './server/local-bridge.mjs';
import { atlasAsset } from './scripts/atlas-asset.mjs';
const playerOrigin = process.env.PLAYER_ORIGIN;
const adminTarget = process.env.CMS_INTERNAL_ORIGIN || 'http://127.0.0.1:4317';
const proxy = {
  '^/(?:admin(?:/|$)|cms-api(?:/|$)|_next/)': { target: adminTarget, ws: true },
  ...(playerOrigin
    ? { '/api/': { target: playerOrigin }, '^/player(?:/|$)': { target: playerOrigin, ws: true } }
    : {}),
};
function attach(server) {
  server.middlewares.use(serveEarthGuide);
  server.middlewares.use(serveEditorial);
  if (!playerOrigin) {
    const community = createCommunityApi({ demo: true, staffSecret: previewBridgeKey() });
    server.middlewares.use(community);
    server.httpServer?.once('close', community.close);
  }
}
export default defineConfig({
  define: {
    'import.meta.env.VITE_PLAYER_ENABLED': JSON.stringify(
      Boolean(playerOrigin) || process.env.VITE_PLAYER_ENABLED === '1',
    ),
  },
  server: {
    proxy,
    fs: { deny: [
      '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
      '**/.local/**', '**/*.sqlite*',
    ] },
  },
  preview: { proxy },
  plugins: [
    react(),
    atlasAsset(),
    { name: 'lingyi-community-api', configureServer: attach, configurePreviewServer: attach },
  ],
});
