<template>
  <div class="py-16">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="mb-12">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">API Reference</h1>
        <p class="text-xl text-gray-600">
          Complete API documentation for SightEdit core library and plugins.
        </p>
      </div>
      
      <!-- Core API -->
      <section class="mb-16">
        <h2 class="text-2xl font-semibold text-gray-900 mb-6">Core API</h2>
        
        <div class="space-y-8">
          <!-- SightEdit.init() -->
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-xl font-medium text-gray-900 mb-3">
              <code class="text-primary-600">SightEdit.init(config)</code>
            </h3>
            <p class="text-gray-600 mb-4">Initialize SightEdit with configuration options.</p>
            
            <h4 class="text-sm font-medium text-gray-900 mb-2">Parameters</h4>
            <div class="code-block text-sm mb-4">
              <pre><code>interface SightEditConfig {
  endpoint: string;                    // API endpoint for saving
  apiKey?: string;                     // Authentication key
  mode?: 'development' | 'production'; // Environment mode
  plugins?: Plugin[];                  // Array of plugins
  theme?: ThemeConfig;                 // UI theme settings
  debug?: boolean;                     // Enable debug mode
  editModeKey?: string;                // Edit mode keyboard shortcut
  onSave?: (data: SaveData) => void;   // Save callback
  onError?: (error: Error) => void;    // Error callback
}</code></pre>
            </div>
            
            <h4 class="text-sm font-medium text-gray-900 mb-2">Example</h4>
            <div class="code-block text-sm">
              <pre><code>SightEdit.init({
  endpoint: '/api/sightedit',
  apiKey: 'your-api-key',
  debug: true,
  editModeKey: 'Ctrl+E'
});</code></pre>
            </div>
          </div>
          
          <!-- SightEdit Methods -->
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-xl font-medium text-gray-900 mb-3">Instance Methods</h3>
            
            <div class="space-y-4">
              <div>
                <h4 class="text-sm font-medium text-gray-900">
                  <code class="text-primary-600">enterEditMode()</code>
                </h4>
                <p class="text-sm text-gray-600">Enable edit mode for all editable elements.</p>
              </div>
              
              <div>
                <h4 class="text-sm font-medium text-gray-900">
                  <code class="text-primary-600">exitEditMode()</code>
                </h4>
                <p class="text-sm text-gray-600">Disable edit mode and save any pending changes.</p>
              </div>
              
              <div>
                <h4 class="text-sm font-medium text-gray-900">
                  <code class="text-primary-600">toggleEditMode()</code>
                </h4>
                <p class="text-sm text-gray-600">Toggle between edit and view modes.</p>
              </div>
              
              <div>
                <h4 class="text-sm font-medium text-gray-900">
                  <code class="text-primary-600">save(sight: string, value: any): Promise&lt;SaveResponse&gt;</code>
                </h4>
                <p class="text-sm text-gray-600">Save a specific element's data.</p>
              </div>
              
              <div>
                <h4 class="text-sm font-medium text-gray-900">
                  <code class="text-primary-600">registerEditor(type: string, editor: EditorConstructor)</code>
                </h4>
                <p class="text-sm text-gray-600">Register a custom editor type.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      <!-- Events -->
      <section class="mb-16">
        <h2 class="text-2xl font-semibold text-gray-900 mb-6">Events</h2>
        
        <div class="border border-gray-200 rounded-lg p-6">
          <div class="code-block text-sm mb-4">
            <pre><code>// Listen to events
SightEdit.on('editModeEnter', () => {
  console.log('Edit mode enabled');
});

SightEdit.on('save', (data) => {
  console.log('Content saved:', data);
});

SightEdit.on('error', (error) => {
  console.error('SightEdit error:', error);
});</code></pre>
          </div>
          
          <h4 class="text-sm font-medium text-gray-900 mb-2">Available Events</h4>
          <ul class="text-sm text-gray-600 space-y-1">
            <li><code>editModeEnter</code> - Edit mode enabled</li>
            <li><code>editModeExit</code> - Edit mode disabled</li>
            <li><code>save</code> - Content saved</li>
            <li><code>error</code> - Error occurred</li>
            <li><code>elementDetected</code> - New editable element found</li>
          </ul>
        </div>
      </section>
      
      <!-- Backend API -->
      <section class="mb-16">
        <h2 class="text-2xl font-semibold text-gray-900 mb-6">Backend API</h2>
        
        <div class="space-y-6">
          <!-- Save Endpoint -->
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-3">
              <span class="bg-green-100 text-green-800 px-2 py-1 rounded text-sm font-mono mr-2">POST</span>
              /save
            </h3>
            <p class="text-gray-600 mb-4">Save content changes for a single element.</p>
            
            <h4 class="text-sm font-medium text-gray-900 mb-2">Request Body</h4>
            <div class="code-block text-sm mb-4">
              <pre><code>{
  "sight": "unique-element-id",
  "value": "new content value",
  "type": "text",
  "context": {
    "url": "/current-page",
    "selector": "h1.title"
  }
}</code></pre>
            </div>
            
            <h4 class="text-sm font-medium text-gray-900 mb-2">Response</h4>
            <div class="code-block text-sm">
              <pre><code>{
  "success": true,
  "data": {
    "id": "element-id",
    "version": 2,
    "lastModified": "2024-01-15T10:30:00Z"
  }
}</code></pre>
            </div>
          </div>
          
          <!-- Batch Endpoint -->
          <div class="border border-gray-200 rounded-lg p-6">
            <h3 class="text-lg font-medium text-gray-900 mb-3">
              <span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-mono mr-2">POST</span>
              /batch
            </h3>
            <p class="text-gray-600 mb-4">Save multiple content changes in a single request.</p>
            
            <h4 class="text-sm font-medium text-gray-900 mb-2">Request Body</h4>
            <div class="code-block text-sm">
              <pre><code>{
  "operations": [
    {
      "type": "update",
      "data": {
        "sight": "header-title",
        "value": "New Title",
        "type": "text"
      }
    },
    {
      "type": "update", 
      "data": {
        "sight": "hero-image",
        "value": "new-hero.jpg",
        "type": "image"
      }
    }
  ]
}</code></pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>