<template>
  <div>
    <!-- Hero Section -->
    <section class="relative overflow-hidden bg-gradient-to-br from-primary-50 to-blue-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div class="text-center">
          <h1 class="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Universal 
            <span class="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-blue-600">
              Visual Editing
            </span> 
            System
          </h1>
          <p class="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
            Transform any website into a visual editor by adding a single JavaScript file and data attributes. 
            Framework-agnostic, powerful, and easy to integrate.
          </p>
          <div class="flex flex-col sm:flex-row gap-4 justify-center">
            <router-link to="/getting-started" class="btn btn-primary text-lg px-8 py-3">
              Get Started
            </router-link>
            <a href="https://github.com/sightedit/sightedit" target="_blank" class="btn btn-outline text-lg px-8 py-3">
              View on GitHub
            </a>
          </div>
        </div>
      </div>
      
      <!-- Hero Code Example -->
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div class="bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">
          <div class="bg-gray-800 px-6 py-3 flex items-center space-x-2">
            <div class="w-3 h-3 bg-red-400 rounded-full"></div>
            <div class="w-3 h-3 bg-yellow-400 rounded-full"></div>
            <div class="w-3 h-3 bg-green-400 rounded-full"></div>
          </div>
          <pre class="p-6 text-sm text-gray-100 overflow-x-auto"><code>{{heroCode}}</code></pre>
        </div>
      </div>
    </section>
    
    <!-- Features Section -->
    <section class="py-24 bg-white">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Everything you need for visual editing
          </h2>
          <p class="text-xl text-gray-600 max-w-2xl mx-auto">
            SightEdit provides a complete toolkit for adding visual editing capabilities to any website.
          </p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div v-for="feature in features" :key="feature.title" class="text-center">
            <div class="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl">{{ feature.icon }}</span>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-3">{{ feature.title }}</h3>
            <p class="text-gray-600 leading-relaxed">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>
    
    <!-- How it Works -->
    <section class="py-24 bg-gray-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            How it works
          </h2>
          <p class="text-xl text-gray-600 max-w-2xl mx-auto">
            Get up and running with SightEdit in just a few simple steps.
          </p>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div v-for="(step, index) in steps" :key="step.title" class="text-center">
            <div class="w-12 h-12 bg-primary-600 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-lg font-bold">
              {{ index + 1 }}
            </div>
            <h3 class="text-xl font-semibold text-gray-900 mb-3">{{ step.title }}</h3>
            <p class="text-gray-600 mb-6 leading-relaxed">{{ step.description }}</p>
            <div class="bg-gray-900 rounded-lg p-4 text-left">
              <pre class="text-sm text-gray-100 overflow-x-auto"><code>{{ step.code }}</code></pre>
            </div>
          </div>
        </div>
      </div>
    </section>
    
    <!-- Plugins Section -->
    <section class="py-24 bg-white">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Powerful plugins
          </h2>
          <p class="text-xl text-gray-600 max-w-2xl mx-auto">
            Extend SightEdit with specialized editing capabilities through our plugin ecosystem.
          </p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div v-for="plugin in plugins" :key="plugin.name" class="bg-gray-50 rounded-2xl p-8">
            <div class="flex items-center mb-4">
              <span class="text-3xl mr-4">{{ plugin.icon }}</span>
              <div>
                <h3 class="text-xl font-semibold text-gray-900">{{ plugin.name }}</h3>
                <p class="text-gray-600">{{ plugin.package }}</p>
              </div>
            </div>
            <p class="text-gray-600 mb-6 leading-relaxed">{{ plugin.description }}</p>
            <div class="flex flex-wrap gap-2">
              <span v-for="feature in plugin.features" :key="feature" class="text-xs px-3 py-1 bg-primary-100 text-primary-800 rounded-full">
                {{ feature }}
              </span>
            </div>
          </div>
        </div>
        
        <div class="text-center mt-12">
          <router-link to="/plugins" class="btn btn-primary">
            Explore All Plugins
          </router-link>
        </div>
      </div>
    </section>
    
    <!-- CTA Section -->
    <section class="py-24 bg-primary-600">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
          Ready to get started?
        </h2>
        <p class="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
          Join thousands of developers who are already using SightEdit to power their visual editing experiences.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <router-link to="/getting-started" class="btn bg-white text-primary-600 hover:bg-gray-50 text-lg px-8 py-3">
            Get Started Now
          </router-link>
          <router-link to="/examples" class="btn border-2 border-white text-white hover:bg-white hover:text-primary-600 text-lg px-8 py-3">
            View Examples
          </router-link>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
const heroCode = `<!-- Add SightEdit to any HTML element -->
<h1 data-sight="text">Editable Heading</h1>
<p data-sight="richtext">Rich text content...</p>
<img data-sight="image" src="photo.jpg" alt="Editable image">

<!-- Initialize SightEdit -->
&lt;script&gt;
import SightEdit from '@sightedit/core';

SightEdit.init({
  endpoint: '/api/sightedit'
});
&lt;/script&gt;`;

const features = [
  {
    icon: '🎯',
    title: 'Framework Agnostic',
    description: 'Works with React, Vue, Angular, vanilla HTML, or any web framework. No dependencies required.'
  },
  {
    icon: '⚡',
    title: 'Easy Integration',
    description: 'Add data attributes to any element and initialize SightEdit. No complex setup or configuration.'
  },
  {
    icon: '🎨',
    title: 'Rich Editor Types',
    description: 'Text, rich text, images, collections, dates, colors, and more. Each with specialized editing interfaces.'
  },
  {
    icon: '🔌',
    title: 'Plugin System',
    description: 'Extend functionality with plugins for markdown, image cropping, custom editors, and more.'
  },
  {
    icon: '💾',
    title: 'Auto Save',
    description: 'Automatic saving with offline support, retry logic, and conflict resolution.'
  },
  {
    icon: '🔒',
    title: 'Secure',
    description: 'Built-in validation, sanitization, and permission checking. Enterprise-ready security.'
  }
];

const steps = [
  {
    title: 'Install',
    description: 'Install SightEdit via NPM or include from CDN.',
    code: `npm install @sightedit/core

# Or via CDN
&lt;script src="https://cdn.sightedit.com/v1/sightedit.min.js"&gt;&lt;/script&gt;`
  },
  {
    title: 'Configure',
    description: 'Initialize SightEdit with your API endpoint.',
    code: `import SightEdit from '@sightedit/core';

SightEdit.init({
  endpoint: '/api/sightedit',
  apiKey: 'your-api-key'
});`
  },
  {
    title: 'Use',
    description: 'Add data-sight attributes to make elements editable.',
    code: `<h1 data-sight="text">Editable Heading</h1>
<p data-sight="richtext">Rich content...</p>
<img data-sight="image" src="photo.jpg">`
  }
];

const plugins = [
  {
    name: 'Markdown Plugin',
    package: '@sightedit/plugin-markdown',
    icon: '📝',
    description: 'Full-featured markdown editor with live preview, syntax highlighting, and export capabilities.',
    features: ['Live Preview', 'Syntax Highlighting', 'Export', 'Task Lists', 'Tables']
  },
  {
    name: 'Image Crop Plugin',
    package: '@sightedit/plugin-image-crop',
    icon: '✂️',
    description: 'Advanced image cropping and editing with filters, aspect ratios, and professional tools.',
    features: ['Crop & Resize', 'Filters', 'Rotation', 'Aspect Ratios', 'Export Formats']
  }
];
</script>