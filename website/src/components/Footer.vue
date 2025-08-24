<template>
  <footer class="bg-gray-50 border-t border-gray-200">
    <div class="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
        <!-- Logo & Description -->
        <div class="md:col-span-1">
          <div class="flex items-center space-x-2 mb-4">
            <div class="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-sm">S</span>
            </div>
            <span class="text-xl font-bold text-gray-900">SightEdit</span>
          </div>
          <p class="text-gray-600 text-sm leading-relaxed">
            Universal Visual Editing System that transforms any website into a visual editor.
          </p>
        </div>
        
        <!-- Documentation -->
        <div>
          <h3 class="text-sm font-semibold text-gray-900 tracking-wider uppercase mb-4">
            Documentation
          </h3>
          <ul class="space-y-2">
            <li><router-link to="/getting-started" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">Getting Started</router-link></li>
            <li><router-link to="/docs" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">Core Library</router-link></li>
            <li><router-link to="/plugins" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">Plugins</router-link></li>
            <li><router-link to="/api" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">API Reference</router-link></li>
          </ul>
        </div>
        
        <!-- Resources -->
        <div>
          <h3 class="text-sm font-semibold text-gray-900 tracking-wider uppercase mb-4">
            Resources
          </h3>
          <ul class="space-y-2">
            <li><router-link to="/examples" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">Examples</router-link></li>
            <li><a href="https://github.com/sightedit/sightedit" target="_blank" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">GitHub</a></li>
            <li><a href="https://npmjs.com/package/@sightedit/core" target="_blank" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">NPM</a></li>
            <li><a href="https://cdn.sightedit.com" target="_blank" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">CDN</a></li>
          </ul>
        </div>
        
        <!-- Community -->
        <div>
          <h3 class="text-sm font-semibold text-gray-900 tracking-wider uppercase mb-4">
            Community
          </h3>
          <ul class="space-y-2">
            <li><a href="https://github.com/sightedit/sightedit/issues" target="_blank" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">Issues</a></li>
            <li><a href="https://github.com/sightedit/sightedit/discussions" target="_blank" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">Discussions</a></li>
            <li><a href="https://github.com/sightedit/sightedit/blob/main/CONTRIBUTING.md" target="_blank" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">Contributing</a></li>
            <li><a href="https://twitter.com/sightedit" target="_blank" class="text-gray-600 hover:text-primary-600 text-sm transition-colors">Twitter</a></li>
          </ul>
        </div>
      </div>
      
      <div class="mt-8 pt-8 border-t border-gray-200">
        <div class="flex flex-col md:flex-row justify-between items-center">
          <p class="text-gray-500 text-sm">
            © {{ new Date().getFullYear() }} SightEdit. Released under the MIT License.
          </p>
          <div class="flex space-x-6 mt-4 md:mt-0">
            <a href="https://github.com/sightedit/sightedit/blob/main/LICENSE" target="_blank" class="text-gray-500 hover:text-gray-600 text-sm transition-colors">
              License
            </a>
            <a href="https://github.com/sightedit/sightedit/blob/main/CODE_OF_CONDUCT.md" target="_blank" class="text-gray-500 hover:text-gray-600 text-sm transition-colors">
              Code of Conduct
            </a>
            <a href="https://github.com/sightedit/sightedit/security" target="_blank" class="text-gray-500 hover:text-gray-600 text-sm transition-colors">
              Security
            </a>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts"></script>