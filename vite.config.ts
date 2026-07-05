import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites under /repo-name/
  base: '/netlab/',
  plugins: [react(), tailwindcss()],
})
