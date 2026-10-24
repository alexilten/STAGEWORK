/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  optimizeDeps: { exclude: ['rhino3dm'] },
  // whole-preset .3dm round-trips take a few seconds each on shared CI runners
  test: { testTimeout: 30000 },
});
