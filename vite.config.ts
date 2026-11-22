import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

const isSingleFile = process.env.LESSONLY_SINGLEFILE === '1';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." still resolve in production builds.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error || isSingleFile) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
      // Builds dist/lessonly-studio-offline.html as a single self-contained
      // HTML document that opens cleanly directly via file:// in File Explorer.
      {
        name: 'inline-portable-dist-html',
        apply: 'build',
        enforce: 'post' as const,
        closeBundle(error?: Error): void {
          if (error || !isSingleFile) {
            return;
          }
          const outDir = path.resolve(import.meta.dirname, 'dist-offline');
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const htmlPath = path.join(outDir, 'index.html');
          if (!fs.existsSync(htmlPath)) {
            return;
          }
          let html = fs.readFileSync(htmlPath, 'utf8');

          html = html.replace(
            /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
            (full, href) => {
              const rel = href.replace(/^\.?\//, '');
              const cssFile = path.join(outDir, rel);
              if (!fs.existsSync(cssFile)) return full;
              const css = fs
                .readFileSync(cssFile, 'utf8')
                .replace(/<\/style>/gi, '<\\/style>');
              return `<style>${css}</style>`;
            },
          );

          const inlinedScripts: string[] = [];
          html = html.replace(
            /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
            (full, src) => {
              const rel = src.replace(/^\.?\//, '');
              const jsFile = path.join(outDir, rel);
              if (!fs.existsSync(jsFile)) return full;
              const js = fs
                .readFileSync(jsFile, 'utf8')
                .replace(/<\/script/gi, '<\\/script');
              inlinedScripts.push(`<script type="module">${js}</script>`);
              return '';
            },
          );

          if (inlinedScripts.length > 0) {
            html = html.replace('</body>', `${inlinedScripts.join('\n')}</body>`);
          }

          fs.mkdirSync(distDir, {recursive: true});
          fs.writeFileSync(
            path.join(distDir, 'lessonly-studio-offline.html'),
            html,
            'utf8',
          );
          fs.rmSync(outDir, {recursive: true, force: true});
        },
      },
    ],
    build: isSingleFile
      ? {
          outDir: 'dist-offline',
          emptyOutDir: true,
          cssCodeSplit: false,
          assetsInlineLimit: 100_000_000,
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        }
      : {
          outDir: 'dist',
          emptyOutDir: true,
          cssCodeSplit: true,
          rollupOptions: {
            output: {
              manualChunks(id) {
                if (id.includes('node_modules/motion')) {
                  return 'vendor-motion';
                }
                if (
                  id.includes('node_modules/react') ||
                  id.includes('node_modules/react-dom')
                ) {
                  return 'vendor-react';
                }
              },
            },
          },
        },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
