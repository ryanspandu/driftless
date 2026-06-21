import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import adonisjs from '@adonisjs/vite/client'
import inertia from '@adonisjs/inertia/vite'
import tailwindcss from '@tailwindcss/vite'
import { serwist } from '@serwist/vite'

export default defineConfig({
  envPrefix: ['VITE_'],
  define: {
    'import.meta.env.VITE_DISABLE_OFFLINE': JSON.stringify(process.env.DISABLE_OFFLINE ?? ''),
  },
  plugins: [
    tailwindcss(),
    react(),
    inertia({ ssr: { enabled: true, entrypoint: 'inertia/ssr.tsx' } }),
    adonisjs({
      entrypoints: ['inertia/app.tsx', 'inertia/sw.ts'],
      reload: ['resources/views/**/*.edge'],
    }),
    serwist({
      swSrc: 'inertia/sw.ts',
      swDest: 'public/sw.js',
      globDirectory: 'public/assets',
      injectionPoint: 'self.__SW_MANIFEST',
      integration: {
        configureOptions(viteConfig, options) {
          const root = viteConfig.root ?? process.cwd()
          const prodAssets = path.resolve(root, 'build/public/assets')
          const devAssets = path.resolve(root, 'public/assets')
          options.globDirectory =
            viteConfig.mode === 'production' && prodAssets ? prodAssets : devAssets
          options.globIgnores = ['**/uploads/**', '**/.vite/**', '**/public/sw.js']
        },
      },
    }),
  ],

  resolve: {
    alias: {
      '~/': `${import.meta.dirname}/inertia/`,
      '@generated': `${import.meta.dirname}/.adonisjs/client/`,
      '@plugins': `${import.meta.dirname}/plugins`,
    },
  },

  server: {
    watch: {
      ignored: ['**/storage/**', '**/tmp/**'],
    },
  },
})
