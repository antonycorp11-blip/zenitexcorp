import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [],
  base: './',
  server: { port: 5280 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
