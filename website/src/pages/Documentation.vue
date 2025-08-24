<template>
  <div class="py-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex flex-col lg:flex-row gap-8">
        <!-- Sidebar -->
        <div class="lg:w-1/4">
          <nav class="sticky top-20 space-y-1">
            <div class="mb-4">
              <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                Core Library
              </h3>
              <ul class="mt-2 space-y-1">
                <li><a href="#installation" class="nav-link text-sm">Installation</a></li>
                <li><a href="#initialization" class="nav-link text-sm">Initialization</a></li>
                <li><a href="#configuration" class="nav-link text-sm">Configuration</a></li>
                <li><a href="#editor-types" class="nav-link text-sm">Editor Types</a></li>
              </ul>
            </div>
            
            <div class="mb-4">
              <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                Framework Adapters
              </h3>
              <ul class="mt-2 space-y-1">
                <li><a href="#react" class="nav-link text-sm">React</a></li>
                <li><a href="#vue" class="nav-link text-sm">Vue</a></li>
              </ul>
            </div>
            
            <div class="mb-4">
              <h3 class="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                Backend
              </h3>
              <ul class="mt-2 space-y-1">
                <li><a href="#nodejs" class="nav-link text-sm">Node.js</a></li>
                <li><a href="#php" class="nav-link text-sm">PHP</a></li>
              </ul>
            </div>
          </nav>
        </div>
        
        <!-- Content -->
        <div class="lg:w-3/4">
          <div class="prose prose-lg max-w-none">
            <h1>Documentation</h1>
            <p class="text-xl text-gray-600">
              Complete guide to integrating and using SightEdit in your projects.
            </p>
            
            <!-- Installation -->
            <section id="installation">
              <h2>Installation</h2>
              
              <h3>NPM Installation</h3>
              <div class="code-block">
                <pre><code># Core library
npm install @sightedit/core

# Framework adapters
npm install @sightedit/react
npm install @sightedit/vue

# Plugins
npm install @sightedit/plugin-markdown
npm install @sightedit/plugin-image-crop

# Backend handlers
npm install @sightedit/server-node</code></pre>
              </div>
              
              <h3>CDN Installation</h3>
              <div class="code-block">
                <pre><code>&lt;!-- Latest version --&gt;
&lt;script src="https://cdn.sightedit.com/v1/sightedit.min.js"&gt;&lt;/script&gt;

&lt;!-- Specific version --&gt;
&lt;script src="https://cdn.sightedit.com/v1.0.0/sightedit.min.js"&gt;&lt;/script&gt;</code></pre>
              </div>
            </section>
            
            <!-- Initialization -->
            <section id="initialization">
              <h2>Initialization</h2>
              
              <h3>Basic Setup</h3>
              <div class="code-block">
                <pre><code>import SightEdit from '@sightedit/core';

SightEdit.init({
  endpoint: '/api/sightedit',
  apiKey: 'your-api-key'
});</code></pre>
              </div>
              
              <h3>With Plugins</h3>
              <div class="code-block">
                <pre><code>import SightEdit from '@sightedit/core';
import MarkdownPlugin from '@sightedit/plugin-markdown';
import ImageCropPlugin from '@sightedit/plugin-image-crop';

SightEdit.init({
  endpoint: '/api/sightedit',
  plugins: [
    new MarkdownPlugin(),
    new ImageCropPlugin({
      aspectRatio: 16/9,
      filters: true
    })
  ]
});</code></pre>
              </div>
            </section>
            
            <!-- Configuration -->
            <section id="configuration">
              <h2>Configuration</h2>
              
              <table class="min-w-full divide-y divide-gray-300">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Option
                    </th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Default
                    </th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">endpoint</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">required</td>
                    <td class="px-6 py-4 text-sm text-gray-500">API endpoint for saving changes</td>
                  </tr>
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">apiKey</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">undefined</td>
                    <td class="px-6 py-4 text-sm text-gray-500">API key for authentication</td>
                  </tr>
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">plugins</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Plugin[]</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">[]</td>
                    <td class="px-6 py-4 text-sm text-gray-500">Array of plugins to load</td>
                  </tr>
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">editModeKey</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">string</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">'Ctrl+E'</td>
                    <td class="px-6 py-4 text-sm text-gray-500">Keyboard shortcut to toggle edit mode</td>
                  </tr>
                  <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">debug</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">boolean</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">false</td>
                    <td class="px-6 py-4 text-sm text-gray-500">Enable debug logging</td>
                  </tr>
                </tbody>
              </table>
            </section>
            
            <!-- Editor Types -->
            <section id="editor-types">
              <h2>Editor Types</h2>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
                <div class="border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-medium text-gray-900 mb-3">Text</h3>
                  <div class="code-block text-sm mb-3">
                    <pre><code>&lt;h1 data-sight="text"&gt;Editable text&lt;/h1&gt;</code></pre>
                  </div>
                  <p class="text-sm text-gray-600">Simple text editing with inline input.</p>
                </div>
                
                <div class="border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-medium text-gray-900 mb-3">Rich Text</h3>
                  <div class="code-block text-sm mb-3">
                    <pre><code>&lt;div data-sight="richtext"&gt;Rich content&lt;/div&gt;</code></pre>
                  </div>
                  <p class="text-sm text-gray-600">WYSIWYG editor with formatting options.</p>
                </div>
                
                <div class="border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-medium text-gray-900 mb-3">Image</h3>
                  <div class="code-block text-sm mb-3">
                    <pre><code>&lt;img data-sight="image" src="photo.jpg"&gt;</code></pre>
                  </div>
                  <p class="text-sm text-gray-600">Image upload and replacement.</p>
                </div>
                
                <div class="border border-gray-200 rounded-lg p-6">
                  <h3 class="text-lg font-medium text-gray-900 mb-3">Collection</h3>
                  <div class="code-block text-sm mb-3">
                    <pre><code>&lt;ul data-sight="collection"&gt;
  &lt;li&gt;Item 1&lt;/li&gt;
  &lt;li&gt;Item 2&lt;/li&gt;
&lt;/ul&gt;</code></pre>
                  </div>
                  <p class="text-sm text-gray-600">Manage lists of repeatable items.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>