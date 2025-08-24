import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import { createRequire } from 'module';
import path from 'path';

const production = !process.env.ROLLUP_WATCH;
const require = createRequire(import.meta.url);
const packageJson = require('./package.json');

// Bundle analyzer plugin
function bundleAnalyzer() {
  return {
    name: 'bundle-analyzer',
    generateBundle(opts, bundle) {
      const analysis = {};
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk') {
          analysis[fileName] = {
            size: chunk.code.length,
            modules: Object.keys(chunk.modules).length,
            dependencies: chunk.imports || [],
            dynamicImports: chunk.dynamicImports || []
          };
        }
      }
      console.log('\nBundle Analysis:', JSON.stringify(analysis, null, 2));
    }
  };
}

// External dependencies that should not be bundled
const externals = {
  // Don't bundle large dependencies - let users decide
  'quill': 'Quill',
  'dompurify': 'DOMPurify'
};

// Common Rollup configuration
const commonConfig = {
  external: Object.keys(externals),
  plugins: [
    resolve({
      preferBuiltins: false,
      browser: true
    }),
    commonjs()
  ]
};

export default [
  // Core bundle (minimal, no heavy editors)
  {
    ...commonConfig,
    input: 'src/index.ts',
    output: {
      file: 'dist/core.esm.js',
      format: 'es',
      sourcemap: true
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
        include: ['src/**/*'],
        exclude: ['**/*.test.ts', '**/*.spec.ts', 'src/editors/richtext.ts', 'src/editors/product-selector.ts', 'src/editors/html-designer.ts', 'src/editors/advanced-bundle.ts'],
        compilerOptions: {
          isolatedModules: true,
          verbatimModuleSyntax: false,
          target: "ES2018",
          module: "ES2020",
          lib: ["ES2018", "DOM"],
          allowJs: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true
        }
      }),
      ...commonConfig.plugins,
      bundleAnalyzer()
    ]
  },
  // Full ES Module build with code splitting
  {
    ...commonConfig,
    input: {
      index: 'src/index.ts',
      // Split editors into separate chunks
      'editors/text': 'src/editors/text.ts',
      'editors/richtext': 'src/editors/richtext.ts',
      'editors/image': 'src/editors/image.ts',
      'editors/collection': 'src/editors/collection.ts',
      'editors/advanced': 'src/editors/advanced-bundle.ts'
    },
    output: {
      dir: 'dist/esm',
      format: 'es',
      sourcemap: true,
      chunkFileNames: '[name]-[hash].js'
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        include: ['src/**/*'],
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
        compilerOptions: {
          target: "ES2018",
          module: "ES2020",
          lib: ["ES2018", "DOM"],
          allowJs: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true
        }
      }),
      ...commonConfig.plugins,
      bundleAnalyzer()
    ]
  },
  // Optimized UMD build
  {
    ...commonConfig,
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'umd',
      name: 'SightEdit',
      sourcemap: true,
      globals: externals
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        include: ['src/**/*'],
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
        compilerOptions: {
          target: "ES2018",
          module: "ES2020",
          lib: ["ES2018", "DOM"],
          allowJs: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true
        }
      }),
      ...commonConfig.plugins,
      bundleAnalyzer()
    ]
  },
  // Highly optimized minified build
  {
    ...commonConfig,
    input: 'src/index.ts',
    output: {
      file: 'dist/sightedit.min.js',
      format: 'umd',
      name: 'SightEdit',
      sourcemap: true,
      globals: externals
    },
    plugins: [
      ...commonConfig.plugins,
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        include: ['src/**/*'],
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
        compilerOptions: {
          target: "ES2018",
          module: "ES2020",
          lib: ["ES2018", "DOM"],
          allowJs: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true
        }
      }),
      production && terser({
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
          passes: 2
        },
        mangle: {
          reserved: ['SightEdit']
        },
        format: {
          comments: false
        }
      })
    ]
  }
];