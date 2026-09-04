import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

function readPort(value: string | undefined): number {
  const port = Number(value ?? '3001')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('VITE_DEV_SERVER_PORT must be a valid TCP port.')
  }
  return port
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: readPort(environment.VITE_DEV_SERVER_PORT),
      strictPort: true,
    },
    preview: {
      port: readPort(environment.VITE_PREVIEW_PORT),
      strictPort: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
