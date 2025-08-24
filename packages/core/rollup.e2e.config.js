import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/sightedit.umd.js',
    format: 'umd',
    name: 'SightEdit',
    sourcemap: false
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      target: 'es5',
      declaration: false,
      include: ['src/**/*'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '../plugin-*/**/*'],
      compilerOptions: {
        strict: false,
        skipLibCheck: true
      }
    })
  ],
  external: []
};