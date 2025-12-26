import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@builders': path.resolve(__dirname, './src/builders'),
      '@components': path.resolve(__dirname, './src/components')
    }
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.tsx'),
      name: 'SightEditAdmin',
      formats: ['es', 'umd'],
      fileName: (format) => `index.${format === 'es' ? 'esm' : 'umd'}.js`
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@sightedit/core'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          '@sightedit/core': 'SightEdit'
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
