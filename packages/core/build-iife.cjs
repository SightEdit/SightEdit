const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Build the bundle
esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  platform: 'browser',
  format: 'iife',
  globalName: 'SightEditInternal',
  external: [], // Bundle everything for standalone usage
  minify: false,
  define: {
    'process.env.NODE_ENV': '"browser"',
    'global': 'window'
  },
  loader: {
    '.ts': 'ts'
  },
  resolveExtensions: ['.ts', '.js'],
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser'],
  // Handle node modules that use dynamic imports
  plugins: [
    {
      name: 'replace-dynamic-imports',
      setup(build) {
        build.onLoad({ filter: /security-manager\.ts$/ }, async (args) => {
          const fs = require('fs');
          let contents = await fs.promises.readFile(args.path, 'utf8');
          // Replace dynamic imports with static requires for bundling
          contents = contents.replace(
            `this.domPurify = await import('dompurify');`,
            `this.domPurify = require('dompurify');`
          );
          contents = contents.replace(
            `const createDOMPurify = await import('isomorphic-dompurify');`,
            `const createDOMPurify = require('isomorphic-dompurify');`
          );
          return { contents, loader: 'ts' };
        });
      }
    }
  ]
}).then(() => {
  // Read the built file
  const builtFile = fs.readFileSync('dist/index.js', 'utf8');
  
  // Wrap it properly to expose SightEdit
  const wrappedContent = `
var SightEdit = (function() {
  ${builtFile.replace('var SightEditInternal = ', 'var result = ')}
  
  // Extract the actual SightEdit object from the result
  if (result && result.default) {
    return result.default;
  }
  return result;
})();

// Make sure it's available globally
if (typeof window !== 'undefined') {
  window.SightEdit = SightEdit;
}
`;

  // Write the wrapped file
  fs.writeFileSync('dist/index.js', wrappedContent);
  
  console.log('✅ IIFE build completed with proper SightEdit export');
  console.log('📦 File size:', fs.statSync('dist/index.js').size, 'bytes');
}).catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});