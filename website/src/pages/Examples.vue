<template>
  <div class="py-16">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-16">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">Examples</h1>
        <p class="text-xl text-gray-600">
          See SightEdit in action with these interactive examples and demos.
        </p>
      </div>
      
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div v-for="example in examples" :key="example.title" class="border border-gray-200 rounded-xl overflow-hidden">
          <div class="aspect-video bg-gray-100 border-b border-gray-200">
            <iframe :src="example.demo" class="w-full h-full" frameborder="0"></iframe>
          </div>
          <div class="p-6">
            <h3 class="text-xl font-semibold text-gray-900 mb-2">{{ example.title }}</h3>
            <p class="text-gray-600 mb-4">{{ example.description }}</p>
            <div class="flex flex-wrap gap-2 mb-4">
              <span v-for="tech in example.technologies" :key="tech" class="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded">
                {{ tech }}
              </span>
            </div>
            <div class="flex space-x-3">
              <a :href="example.demo" target="_blank" class="btn btn-primary">
                View Demo
              </a>
              <a :href="example.source" target="_blank" class="btn btn-outline">
                Source Code
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const examples = [
  {
    title: 'Blog with SightEdit',
    description: 'A complete blog implementation showing text, rich text, and image editing capabilities.',
    demo: '/examples/blog/',
    source: 'https://github.com/sightedit/examples/tree/main/blog',
    technologies: ['HTML', 'CSS', 'JavaScript', 'Node.js']
  },
  {
    title: 'React Portfolio',
    description: 'Portfolio website built with React showing component-based editing integration.',
    demo: '/examples/react-portfolio/',
    source: 'https://github.com/sightedit/examples/tree/main/react-portfolio',
    technologies: ['React', 'TypeScript', 'Tailwind CSS']
  },
  {
    title: 'Vue E-commerce',
    description: 'Product catalog with editable content, collections, and image management.',
    demo: '/examples/vue-ecommerce/',
    source: 'https://github.com/sightedit/examples/tree/main/vue-ecommerce',
    technologies: ['Vue 3', 'TypeScript', 'Composition API']
  },
  {
    title: 'Markdown Documentation',
    description: 'Technical documentation site with markdown editing and live preview.',
    demo: '/examples/markdown-docs/',
    source: 'https://github.com/sightedit/examples/tree/main/markdown-docs',
    technologies: ['Markdown Plugin', 'Prism.js', 'HTML']
  }
];
</script>