import { realpathSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // relative paths, so the built site works under any folder such as GitHub Pages
  // node_modules may be a link to a folder outside Google Drive; let the dev server read fonts from there
  server: { port: 5183, strictPort: true, fs: { allow: ['.', realpathSync('node_modules')] } },
})
