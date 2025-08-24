<template>
  <div class="py-16">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="mb-12">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">Getting Started</h1>
        <p class="text-xl text-gray-600">
          Learn how to integrate SightEdit into your project in just a few minutes.
        </p>
      </div>
      
      <!-- Quick Start -->
      <section class="mb-16">
        <h2 class="text-2xl font-semibold text-gray-900 mb-6">Quick Start</h2>
        
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <div class="flex">
            <div class="flex-shrink-0">
              <span class="text-2xl">⚡</span>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-blue-800">Try it immediately</h3>
              <p class="text-sm text-blue-700 mt-1">
                The fastest way to see SightEdit in action is through our CDN.
              </p>
            </div>
          </div>
        </div>
        
        <div class="code-block mb-6">
          <pre><code>&lt;!DOCTYPE html&gt;
&lt;html&gt;
&lt;head&gt;
  &lt;title&gt;SightEdit Demo&lt;/title&gt;
&lt;/head&gt;
&lt;body&gt;
  &lt;h1 data-sight="text"&gt;Click to edit this heading&lt;/h1&gt;
  &lt;p data-sight="richtext"&gt;This paragraph supports &lt;strong&gt;rich text&lt;/strong&gt; editing.&lt;/p&gt;
  &lt;img data-sight="image" src="https://via.placeholder.com/400x200" alt="Editable image"&gt;
  
  &lt;script src="https://cdn.sightedit.com/v1/sightedit.min.js"&gt;&lt;/script&gt;
  &lt;script&gt;
    SightEdit.init({
      endpoint: '/api/sightedit' // Replace with your API endpoint
    });
  &lt;/script&gt;
&lt;/body&gt;
&lt;/html&gt;</code></pre>
        </div>
        
        <p class="text-gray-600">
          Press <kbd class="px-2 py-1 bg-gray-200 rounded text-sm">Ctrl/Cmd + E</kbd> to toggle edit mode!
        </p>
      </section>
      
      <!-- Installation -->
      <section class="mb-16">
        <h2 class="text-2xl font-semibold text-gray-900 mb-6">Installation</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">NPM</h3>
            <div class="code-block text-sm">
              <pre><code>npm install @sightedit/core</code></pre>
            </div>
          </div>
          
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">CDN</h3>
            <div class="code-block text-sm">
              <pre><code>&lt;script src="https://cdn.sightedit.com/v1/sightedit.min.js"&gt;&lt;/script&gt;</code></pre>
            </div>
          </div>
        </div>
      </section>
      
      <!-- Framework Integration -->
      <section class="mb-16">
        <h2 class="text-2xl font-semibold text-gray-900 mb-6">Framework Integration</h2>
        
        <div class="space-y-8">
          <!-- React -->
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-xl font-medium text-gray-900 mb-4">React</h3>
            <div class="code-block mb-4">
              <pre><code>npm install @sightedit/react</code></pre>
            </div>
            <div class="code-block">
              <pre><code>import { SightEditProvider, Editable } from '@sightedit/react';

function App() {
  return (
    &lt;SightEditProvider config={<!-- -->{
      endpoint: '/api/sightedit'
    }<!-- -->}&gt;
      &lt;Editable type="text" defaultValue="Edit me!"&gt;
        &lt;h1&gt;Edit me!&lt;/h1&gt;
      &lt;/Editable&gt;
    &lt;/SightEditProvider&gt;
  );
}</code></pre>
            </div>
          </div>
          
          <!-- Vue -->
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-xl font-medium text-gray-900 mb-4">Vue</h3>
            <div class="code-block mb-4">
              <pre><code>npm install @sightedit/vue</code></pre>
            </div>
            <div class="code-block">
              <pre><code>import { createApp } from 'vue';
import SightEditPlugin from '@sightedit/vue';

const app = createApp(App);
app.use(SightEditPlugin, {
  endpoint: '/api/sightedit'
});

// In your component
&lt;template&gt;
  &lt;SightEditable type="text" default-value="Edit me!"&gt;
    &lt;h1&gt;{{ content }}&lt;/h1&gt;
  &lt;/SightEditable&gt;
&lt;/template&gt;</code></pre>
            </div>
          </div>
        </div>
      </section>
      
      <!-- Backend Setup -->
      <section class="mb-16">
        <h2 class="text-2xl font-semibold text-gray-900 mb-6">Backend Setup</h2>
        
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <div class="flex">
            <div class="flex-shrink-0">
              <span class="text-2xl">⚠️</span>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-yellow-800">Backend Required</h3>
              <p class="text-sm text-yellow-700 mt-1">
                SightEdit needs a backend endpoint to save changes. Choose from our handlers or create your own.
              </p>
            </div>
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- Node.js -->
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">Node.js / Express</h3>
            <div class="code-block mb-4 text-sm">
              <pre><code>npm install @sightedit/server-node</code></pre>
            </div>
            <div class="code-block text-sm">
              <pre><code>const { SightEditHandler } = require('@sightedit/server-node');

app.use('/api/sightedit', SightEditHandler({
  storage: 'file', // or 'memory', 'mongodb', etc.
  path: './content'
}));</code></pre>
            </div>
          </div>
          
          <!-- PHP -->
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-4">PHP</h3>
            <div class="code-block mb-4 text-sm">
              <pre><code>composer require sightedit/server-php</code></pre>
            </div>
            <div class="code-block text-sm">
              <pre><code>&lt;?php
require_once 'vendor/autoload.php';

use SightEdit\Server\Handler;

$handler = new Handler([
    'storage' => 'file',
    'path' => './content'
]);

$handler->handle();</code></pre>
            </div>
          </div>
        </div>
      </section>
      
      <!-- Next Steps -->
      <section class="mb-16">
        <h2 class="text-2xl font-semibold text-gray-900 mb-6">Next Steps</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="border border-gray-200 rounded-lg p-6 text-center">
            <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">📚</span>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">Read the Docs</h3>
            <p class="text-gray-600 text-sm mb-4">
              Learn about all available editor types and configuration options.
            </p>
            <router-link to="/docs" class="btn btn-outline">
              Documentation
            </router-link>
          </div>
          
          <div class="border border-gray-200 rounded-lg p-6 text-center">
            <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">🔌</span>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">Explore Plugins</h3>
            <p class="text-gray-600 text-sm mb-4">
              Extend functionality with plugins for markdown, image editing, and more.
            </p>
            <router-link to="/plugins" class="btn btn-outline">
              View Plugins
            </router-link>
          </div>
          
          <div class="border border-gray-200 rounded-lg p-6 text-center">
            <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">💡</span>
            </div>
            <h3 class="text-lg font-medium text-gray-900 mb-2">See Examples</h3>
            <p class="text-gray-600 text-sm mb-4">
              Check out real-world examples and implementation patterns.
            </p>
            <router-link to="/examples" class="btn btn-outline">
              Examples
            </router-link>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>