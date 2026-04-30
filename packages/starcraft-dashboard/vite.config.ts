import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  server: {
    port: 9120,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:9121',
      '/ws': {
        target: 'ws://127.0.0.1:9121',
        ws: true,
      },
      '/casc-assets': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/casc-assets/, '') || '/',
      },
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'three-core': ['three'],
          'react-three': ['@react-three/fiber', '@react-three/drei'],
        }
      }
    }
  },
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    exclude: ['better-sqlite3']
  }
})
