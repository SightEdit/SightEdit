<template>
  <div class="py-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">Plugins</h1>
        <p class="text-xl text-gray-600">
          Extend SightEdit with powerful plugins for specialized editing needs.
        </p>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div v-for="plugin in plugins" :key="plugin.name" class="border border-gray-200 rounded-xl p-8">
          <div class="flex items-center mb-6">
            <span class="text-4xl mr-4">{{ plugin.icon }}</span>
            <div>
              <h3 class="text-2xl font-semibold text-gray-900">{{ plugin.name }}</h3>
              <p class="text-gray-600">{{ plugin.package }}</p>
            </div>
          </div>
          
          <p class="text-gray-600 mb-6 leading-relaxed">{{ plugin.description }}</p>
          
          <div class="mb-6">
            <h4 class="text-sm font-medium text-gray-900 mb-3">Features</h4>
            <div class="flex flex-wrap gap-2">
              <span v-for="feature in plugin.features" :key="feature" class="text-xs px-3 py-1 bg-primary-100 text-primary-800 rounded-full">
                {{ feature }}
              </span>
            </div>
          </div>
          
          <div class="code-block text-sm mb-6">
            <pre><code>{{ plugin.installCode }}</code></pre>
          </div>
          
          <div class="flex space-x-3">
            <a :href="plugin.docs" class="btn btn-primary">Documentation</a>
            <a :href="plugin.github" target="_blank" class="btn btn-outline">GitHub</a>
          </div>
        </div>
      </div>
      
      <!-- Plugin Development -->
      <section class="mt-24">
        <div class="bg-gray-50 rounded-2xl p-12 text-center">
          <h2 class="text-3xl font-bold text-gray-900 mb-4">Create Your Own Plugin</h2>
          <p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Build custom editors and extend SightEdit functionality with our plugin development guide.
          </p>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/docs/plugin-development" class="btn btn-primary">
              Plugin Development Guide
            </a>
            <a href="https://github.com/sightedit/plugin-template" target="_blank" class="btn btn-outline">
              Plugin Template
            </a>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
const plugins = [
  {
    name: 'Markdown Plugin',
    package: '@sightedit/plugin-markdown',
    icon: '📝',
    description: 'Full-featured markdown editor with live preview, syntax highlighting, toolbar, and export capabilities. Perfect for documentation, blogs, and content management.',
    features: ['Live Preview', 'Syntax Highlighting', 'Toolbar', 'Export Options', 'Task Lists', 'Tables', 'Emojis', 'Footnotes'],
    installCode: `npm install @sightedit/plugin-markdown

import MarkdownPlugin from '@sightedit/plugin-markdown';

SightEdit.init({
  plugins: [new MarkdownPlugin()]
});`,
    docs: '/docs/plugins/markdown',
    github: 'https://github.com/sightedit/sightedit/tree/main/packages/plugin-markdown'
  },
  {
    name: 'Image Crop Plugin',
    package: '@sightedit/plugin-image-crop',
    icon: '✂️',
    description: 'Professional image cropping and editing with filters, aspect ratios, rotation tools, and export options. Built with Cropper.js for maximum compatibility.',
    features: ['Crop & Resize', 'Image Filters', 'Rotation & Flip', 'Aspect Ratios', 'Zoom Controls', 'Touch Support', 'Export Formats', 'Professional Tools'],
    installCode: `npm install @sightedit/plugin-image-crop

import ImageCropPlugin from '@sightedit/plugin-image-crop';

SightEdit.init({
  plugins: [new ImageCropPlugin({
    aspectRatio: 16/9,
    filters: true
  })]
});`,
    docs: '/docs/plugins/image-crop',
    github: 'https://github.com/sightedit/sightedit/tree/main/packages/plugin-image-crop'
  }
];
</script>