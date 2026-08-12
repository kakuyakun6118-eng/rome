import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src/ui',
  /*
   * 資産を相対パスで参照する。GitHub Pages のような
   * ドメイン直下でない場所に置いても届くようにするため
   */
  base: './',
  build: { outDir: '../../dist', emptyOutDir: true },
});
