import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? './' : '/',
  server: {
    proxy: {
      '/api': 'http://localhost:8080'
    }
  }
}))
