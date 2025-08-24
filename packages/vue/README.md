# SightEdit Vue Adapter

Official Vue 3 adapter for SightEdit visual editing system.

## Installation

```bash
npm install @sightedit/core @sightedit/vue
```

## Quick Start

### Option 1: Global Plugin

```js
// main.js
import { createApp } from 'vue';
import { SightEditPlugin } from '@sightedit/vue';
import App from './App.vue';

const app = createApp(App);

app.use(SightEditPlugin, {
  endpoint: '/api/sightedit',
  debug: true
});

app.mount('#app');
```

Then use in components:

```vue
<template>
  <div>
    <Editable sight="hero.title" type="text">
      <h1>Welcome to SightEdit</h1>
    </Editable>
    
    <Editable sight="hero.description" type="richtext">
      <p>Edit this content visually!</p>
    </Editable>
  </div>
</template>

<script>
import { Editable } from '@sightedit/vue';

export default {
  components: { Editable }
};
</script>
```

### Option 2: Provider Component

```vue
<template>
  <SightEditProvider :config="sightEditConfig">
    <div class="app">
      <Editable sight="hero.title" type="text">
        <h1>Welcome to SightEdit</h1>
      </Editable>
    </div>
  </SightEditProvider>
</template>

<script>
import { SightEditProvider, Editable } from '@sightedit/vue';

export default {
  components: { SightEditProvider, Editable },
  data() {
    return {
      sightEditConfig: {
        endpoint: '/api/sightedit',
        debug: true
      }
    };
  }
};
</script>
```

## Components

### Editable

Makes any content editable:

```vue
<template>
  <Editable 
    sight="product.name"
    type="text"
    placeholder="Enter product name"
    :required="true"
    :max-length="100"
    @change="handleChange"
  >
    <h2>{{ productName }}</h2>
  </Editable>
</template>

<script setup>
import { ref } from 'vue';
import { Editable } from '@sightedit/vue';

const productName = ref('Product Name');

const handleChange = (value) => {
  console.log('Content changed:', value);
};
</script>
```

Props:
- `sight` (required): Unique identifier for the content
- `type`: Editor type (text, richtext, image, link, etc.)
- `tag`: HTML tag to render (default: 'div')
- `placeholder`: Placeholder text
- `required`: Make field required
- `min-length`/`max-length`: Text length constraints
- `min`/`max`: Number constraints
- `options`: Options for select type
- `validation`: Custom validation function

Events:
- `@change`: Emitted when content changes

### EditModeToggle

Button to toggle edit mode:

```vue
<template>
  <EditModeToggle>
    <template #default>
      {{ isEditMode ? 'Exit Edit' : 'Enter Edit' }}
    </template>
  </EditModeToggle>
</template>

<script setup>
import { EditModeToggle, useEditMode } from '@sightedit/vue';

const { isEditMode } = useEditMode();
</script>
```

## Composition API

### useSightEdit

Access the SightEdit instance and state:

```vue
<script setup>
import { useSightEdit } from '@sightedit/vue';

const { state, toggleEditMode, save } = useSightEdit();

// Access state
console.log(state.isEditMode);
console.log(state.instance);

// Toggle edit mode
const handleToggle = () => {
  toggleEditMode();
};

// Save custom data
const saveCustomData = async () => {
  await save('custom.data', { foo: 'bar' });
};
</script>
```

### useEditMode

Just get edit mode state:

```vue
<script setup>
import { useEditMode } from '@sightedit/vue';

const { isEditMode, toggleEditMode } = useEditMode();
</script>

<template>
  <header>
    <span v-if="isEditMode">Editing...</span>
    <button @click="toggleEditMode">
      {{ isEditMode ? 'Exit' : 'Edit' }}
    </button>
  </header>
</template>
```

### useSightEditSave

Get the save function:

```vue
<script setup>
import { useSightEditSave } from '@sightedit/vue';

const save = useSightEditSave();

const handleSave = async () => {
  await save('settings.theme', '#667eea');
};
</script>
```

## Options API

If using global plugin:

```vue
<template>
  <div>
    <p>Edit mode: {{ $sightEdit.state.isEditMode ? 'ON' : 'OFF' }}</p>
    <button @click="$sightEdit.toggleEditMode()">Toggle</button>
  </div>
</template>

<script>
export default {
  mounted() {
    console.log(this.$sightEdit.state.instance);
  }
};
</script>
```

## Advanced Usage

### With TypeScript

```vue
<script setup lang="ts">
import { Editable } from '@sightedit/vue';
import type { SightEditConfig } from '@sightedit/vue';

const config: SightEditConfig = {
  endpoint: '/api/sightedit',
  auth: {
    type: 'bearer',
    token: 'your-token'
  }
};

const handleChange = (value: any) => {
  console.log('Changed:', value);
};
</script>
```

### Collection Editing

```vue
<template>
  <Editable sight="features" type="collection">
    <div class="features-grid">
      <div v-for="i in 3" :key="i" :data-sight-item="i">
        <h3 :data-sight="`title`">Feature {{ i }}</h3>
        <p :data-sight="`description`">Description {{ i }}</p>
      </div>
    </div>
  </Editable>
</template>
```

### Custom Editor Types

```vue
<template>
  <Editable
    sight="settings.theme"
    type="color"
    @change="updateTheme"
  >
    <div class="color-display" :style="{ backgroundColor: themeColor }">
      Theme Color: {{ themeColor }}
    </div>
  </Editable>
</template>

<script setup>
import { ref } from 'vue';
import { Editable } from '@sightedit/vue';

const themeColor = ref('#667eea');

const updateTheme = (color) => {
  themeColor.value = color;
  document.body.style.backgroundColor = color;
};
</script>
```

### With Authentication

```js
// main.js
app.use(SightEditPlugin, {
  endpoint: '/api/sightedit',
  auth: {
    type: 'bearer',
    getToken: async () => {
      const token = await fetchAuthToken();
      return token;
    }
  }
});
```

### Nuxt 3 Integration

```js
// plugins/sightedit.client.js
import { SightEditPlugin } from '@sightedit/vue';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(SightEditPlugin, {
    endpoint: '/api/sightedit',
    mode: process.env.NODE_ENV === 'development' ? 'development' : 'production'
  });
});
```

## Error Handling

```js
app.use(SightEditPlugin, {
  endpoint: '/api/sightedit',
  onError: (error) => {
    console.error('SightEdit error:', error);
    // Show notification
    toast.error('Failed to save changes');
  }
});
```

## Dynamic Content

SightEdit automatically detects new editable elements:

```vue
<template>
  <div>
    <button @click="addItem">Add Item</button>
    
    <div v-for="item in items" :key="item.id">
      <Editable :sight="`item.${item.id}.name`" type="text">
        <h3>{{ item.name }}</h3>
      </Editable>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Editable } from '@sightedit/vue';

const items = ref([
  { id: 1, name: 'Item 1' }
]);

const addItem = () => {
  items.value.push({
    id: Date.now(),
    name: `Item ${items.value.length + 1}`
  });
};
</script>
```