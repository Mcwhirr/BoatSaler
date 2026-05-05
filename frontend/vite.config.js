import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function normalizeBaseUrl(baseUrl) {
  const normalizedValue = `${baseUrl ?? ''}`.trim()
  if (!normalizedValue) {
    return './'
  }

  return normalizedValue.endsWith('/') ? normalizedValue : `${normalizedValue}/`
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const publicBaseUrl = env.VITE_PUBLIC_BASE_URL

  return {
    plugins: [react()],
    base: command === 'build' ? normalizeBaseUrl(publicBaseUrl || '/') : '/',
    server: {
      proxy: {
        '/api': 'http://localhost:8080'
      }
    }
  }
})
