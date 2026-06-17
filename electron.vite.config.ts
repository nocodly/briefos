import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: resolve(__dirname, '.env') })

// BriefOS — electron-vite config.
// Three independent build targets: main (Node), preload (Node sandbox bridge),
// renderer (React + Tailwind in the BrowserWindow).
export default defineConfig({
  main: {
    // externalizeDepsPlugin keeps node_modules out of the bundle so native
    // addons (better-sqlite3) and binaries (ffmpeg-static) resolve at runtime.
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      lib: {
        entry: resolve(__dirname, 'src/main/index.ts')
      },
      rollupOptions: {
        // Native + binary deps must never be bundled.
        external: ['better-sqlite3', 'ffmpeg-static', 'node-record-lpcm16']
      }
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
        '@capture': resolve(__dirname, 'src/capture'),
        '@transcription': resolve(__dirname, 'src/transcription'),
        '@ai': resolve(__dirname, 'src/ai'),
        '@storage': resolve(__dirname, 'src/storage'),
        '@output': resolve(__dirname, 'src/output'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      lib: {
        entry: resolve(__dirname, 'src/main/preload.ts')
      },
      rollupOptions: {
        output: {
          // Force CommonJS with an unambiguous .cjs extension. The package is
          // "type": "module", so a bare .js/.mjs preload would be loaded as ESM
          // — which Electron 28's sandboxed preload does not support. .cjs is
          // always CommonJS, so contextBridge runs and window.electron exists.
          format: 'cjs',
          entryFileNames: 'preload.cjs'
        }
      }
    }
  },

  renderer: {
    // The renderer is a standalone Vite app rooted at src/renderer.
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    // Expose Supabase credentials to the renderer via import.meta.env.
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ''),
      'import.meta.env.VITE_STRIPE_PRO_LINK': JSON.stringify(process.env.VITE_STRIPE_PRO_LINK ?? '')
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          // Main UI window.
          index: resolve(__dirname, 'src/renderer/index.html'),
          // Floating always-on-top recording widget (separate BrowserWindow).
          overlay: resolve(__dirname, 'src/renderer/overlay.html')
        }
      }
    }
  }
})
