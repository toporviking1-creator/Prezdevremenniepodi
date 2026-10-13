import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `--mode single` собирает всё приложение в один index.html (удобно для
// переноса на флешке / открытия без сервера).
export default defineConfig(({ mode }) => ({
  // Исходная страница — web/index.html; корневой index.html — готовая сборка для GitHub Pages.
  root: 'web',
  publicDir: '../public',
  base: './',
  plugins: mode === 'single' ? [react(), viteSingleFile()] : [react()],
  build: {
    outDir: mode === 'single' ? '../dist-single' : '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    root: '.',
    dir: 'src',
    environment: 'node',
  },
}));
