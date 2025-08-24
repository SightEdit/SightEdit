# SightEdit React Adapter

Official React adapter for SightEdit visual editing system.

## Installation

```bash
npm install @sightedit/core @sightedit/react
```

## Quick Start

```jsx
import React from 'react';
import { SightEditProvider, Editable } from '@sightedit/react';

function App() {
  return (
    <SightEditProvider config={{
      endpoint: '/api/sightedit',
      debug: true
    }}>
      <div className="container">
        <Editable sight="hero.title" type="text">
          <h1>Welcome to SightEdit</h1>
        </Editable>
        
        <Editable sight="hero.description" type="richtext">
          <p>Edit this content visually!</p>
        </Editable>
      </div>
    </SightEditProvider>
  );
}

export default App;
```

## Components

### SightEditProvider

Wraps your app and initializes SightEdit:

```jsx
<SightEditProvider config={{
  endpoint: '/api/sightedit',
  apiKey: 'your-api-key',
  theme: {
    primaryColor: '#007bff'
  },
  onSave: (data) => {
    console.log('Saved:', data);
  }
}}>
  {/* Your app */}
</SightEditProvider>
```

### Editable

Makes any content editable:

```jsx
<Editable 
  sight="product.name"
  type="text"
  placeholder="Enter product name"
  required
  maxLength={100}
>
  <h2>Product Name</h2>
</Editable>
```

Props:
- `sight` (required): Unique identifier for the content
- `type`: Editor type (text, richtext, image, link, etc.)
- `placeholder`: Placeholder text
- `required`: Make field required
- `minLength`/`maxLength`: Text length constraints
- `min`/`max`: Number constraints
- `options`: Options for select type
- `validation`: Custom validation function
- `onChange`: Callback when content changes

### EditModeToggle

Button to toggle edit mode:

```jsx
<EditModeToggle className="btn btn-primary">
  {({ isEditMode }) => isEditMode ? 'Exit Edit' : 'Enter Edit'}
</EditModeToggle>
```

## Hooks

### useSightEdit

Access the SightEdit instance and state:

```jsx
function MyComponent() {
  const { instance, isEditMode, toggleEditMode, save } = useSightEdit();
  
  return (
    <div>
      <p>Edit mode: {isEditMode ? 'ON' : 'OFF'}</p>
      <button onClick={toggleEditMode}>Toggle</button>
    </div>
  );
}
```

### useEditMode

Just get edit mode state:

```jsx
function Header() {
  const { isEditMode, toggleEditMode } = useEditMode();
  
  return (
    <header>
      {isEditMode && <span>Editing...</span>}
    </header>
  );
}
```

### useSightEditSave

Get the save function:

```jsx
function SaveButton() {
  const save = useSightEditSave();
  
  const handleSave = async () => {
    await save('custom.data', { foo: 'bar' });
  };
  
  return <button onClick={handleSave}>Save Custom Data</button>;
}
```

## Advanced Usage

### With TypeScript

```tsx
import { SightEditProvider, Editable, EditableProps } from '@sightedit/react';
import type { SightEditConfig } from '@sightedit/react';

const config: SightEditConfig = {
  endpoint: '/api/sightedit',
  auth: {
    type: 'bearer',
    token: 'your-token'
  }
};

interface ProductProps extends EditableProps {
  productId: string;
}

const ProductTitle: React.FC<ProductProps> = ({ productId, ...props }) => {
  return (
    <Editable
      sight={`product.${productId}.title`}
      type="text"
      {...props}
    >
      <h1>Product Title</h1>
    </Editable>
  );
};
```

### Custom Editor Types

```jsx
<Editable
  sight="settings.theme"
  type="color"
  onChange={(color) => {
    document.body.style.backgroundColor = color;
  }}
>
  <div style={{ padding: '10px', border: '1px solid #ddd' }}>
    Theme Color: #667eea
  </div>
</Editable>
```

### Collection Editing

```jsx
<Editable sight="features" type="collection">
  <div className="features-grid">
    <div data-sight-item="1">
      <h3 data-sight="title">Feature 1</h3>
      <p data-sight="description">Description</p>
    </div>
    <div data-sight-item="2">
      <h3 data-sight="title">Feature 2</h3>
      <p data-sight="description">Description</p>
    </div>
  </div>
</Editable>
```

### With Authentication

```jsx
<SightEditProvider config={{
  endpoint: '/api/sightedit',
  auth: {
    type: 'bearer',
    getToken: async () => {
      const token = await fetchAuthToken();
      return token;
    }
  }
}}>
  {/* Your app */}
</SightEditProvider>
```

### Class Components

Use the HOC for class components:

```jsx
import { withSightEdit } from '@sightedit/react';

class MyComponent extends React.Component {
  render() {
    const { isEditMode, toggleEditMode } = this.props;
    
    return (
      <div>
        <p>Edit mode: {isEditMode ? 'ON' : 'OFF'}</p>
        <button onClick={toggleEditMode}>Toggle</button>
      </div>
    );
  }
}

export default withSightEdit(MyComponent);
```

## Next.js Integration

```jsx
// pages/_app.js
import { SightEditProvider } from '@sightedit/react';

function MyApp({ Component, pageProps }) {
  return (
    <SightEditProvider config={{
      endpoint: '/api/sightedit',
      mode: process.env.NODE_ENV === 'development' ? 'development' : 'production'
    }}>
      <Component {...pageProps} />
    </SightEditProvider>
  );
}

export default MyApp;
```

## Error Handling

```jsx
<SightEditProvider config={{
  endpoint: '/api/sightedit',
  onError: (error) => {
    console.error('SightEdit error:', error);
    toast.error('Failed to save changes');
  }
}}>
  {/* Your app */}
</SightEditProvider>
```