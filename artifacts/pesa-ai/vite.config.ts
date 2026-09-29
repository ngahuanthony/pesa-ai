import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// @replit/vite-plugin-runtime-error-modal is a dev-only overlay — import it
// lazily so Railway / Hetzner builds succeed without the Replit environment.
let runtimeErrorOverlay: () => any = () => null;
try { runtimeErrorOverlay = (await import('@replit/vite-plugin-runtime-error-modal')).default; } catch { /* not in Replit env */ }

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

export default defineConfig(async ({ command, mode }) => {
  const isProductionBuild = command === 'build' && mode === 'production';
  const configuredClerkKey =
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY;

  if (isProductionBuild) {
    if (!configuredClerkKey) {
      throw new Error(
        'A Clerk publishable key is required for production frontend builds.',
      );
    }
    if (
      !configuredClerkKey.startsWith('pk_live_') &&
      !configuredClerkKey.startsWith('live_')
    ) {
      throw new Error(
        'Production frontend builds require a live-mode Clerk publishable key.',
      );
    }
  }

  return {
  base: basePath,
  define: isProductionBuild
    ? {
        'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY':
          JSON.stringify(configuredClerkKey),
      }
    : undefined,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  };
});
