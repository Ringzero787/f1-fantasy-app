import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode preview` builds a copy that skips sign-in and renders example data, for the
// scroll-budget test and design review. A production build has no such path (see src/lib/env.ts).
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022', sourcemap: false,
    rollupOptions: { output: { manualChunks: { firebase: ['firebase/app', 'firebase/auth'], data: ['firebase/firestore', 'firebase/functions'] } } },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
