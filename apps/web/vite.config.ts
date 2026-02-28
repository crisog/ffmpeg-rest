import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react-swc';
import { nitro } from 'nitro/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true
  },
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      semicolons: true,
      quoteStyle: 'single'
    }),
    react(),
    tailwindcss(),
    ...nitro({
      builder: 'rolldown',
      serverDir: './'
    })
  ]
});
