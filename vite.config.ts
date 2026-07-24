import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import fs from 'node:fs';
import path from 'node:path';

const contractName = 'auction';
const assetRoot = path.resolve(process.cwd(), 'contracts', 'managed', contractName);
const midnightZkAssets: Plugin = {
  name: 'midnight-zk-assets',
  configureServer(server) {
    server.middlewares.use(`/midnight/${contractName}`, (req, res, next) => {
      const relative = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\//, '');
      if (!/^(keys|zkir)\//.test(relative) || relative.includes('..')) return next();
      const file = path.resolve(assetRoot, relative);
      if (!file.startsWith(assetRoot)) return next();
      fs.readFile(file, (error, data) => {
        if (error) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(data);
      });
    });
  },
  generateBundle() {
    for (const directory of ['keys', 'zkir']) {
      const sourceDirectory = path.join(assetRoot, directory);
      if (!fs.existsSync(sourceDirectory)) continue;
      for (const file of fs.readdirSync(sourceDirectory)) {
        if (!/\.(prover|verifier|bzkir)$/.test(file)) continue;
        this.emitFile({ type: 'asset', fileName: `midnight/${contractName}/${directory}/${file}`, source: fs.readFileSync(path.join(sourceDirectory, file)) });
      }
    }
  },
};
export default defineConfig({ plugins: [react(), wasm(), topLevelAwait(), midnightZkAssets], build: { outDir: 'dist' } });

