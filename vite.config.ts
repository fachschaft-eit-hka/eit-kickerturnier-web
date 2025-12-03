import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/kickertool': {
        target: 'https://live.kickertool.de',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/kickertool/, '/api/table_soccer'),
      },
    },
  },
})
