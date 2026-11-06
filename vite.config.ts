import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  // Firebase rarely changes, so keeping it apart means a new release doesn't make everyone download it again.
  build: { chunkSizeWarningLimit: 800, rolldownOptions: { output: { advancedChunks: { groups: [{ name: 'firebase', test: /node_modules[\\/]@?firebase/ }] } } } },
})
