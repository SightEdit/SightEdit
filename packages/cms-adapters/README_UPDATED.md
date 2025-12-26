# @sightedit/cms-adapters

Headless CMS adapters for SightEdit. Connect to Contentful, Strapi, Sanity, WordPress, and more.

## ✨ Features

- 🔌 **4 CMS Adapters**: Contentful, Strapi, Sanity, WordPress
- 🎯 **Unified API**: Same interface for all CMS platforms
- 📦 **Type-Safe**: Full TypeScript support
- 🔄 **Real-time**: Support for webhooks and live updates
- 🌍 **Localization**: Multi-language content support
- 📝 **Versioning**: Content history and rollback
- 🖼️ **Assets**: Image and file upload
- 🔍 **Search**: Full-text search across platforms

## 📦 Installation

```bash
npm install @sightedit/cms-adapters
```

## 🚀 Quick Start

### Contentful
```typescript
import { ContentfulAdapter } from '@sightedit/cms-adapters';

const adapter = new ContentfulAdapter({
  space: 'space-id',
  accessToken: 'token',
  managementToken: 'mgmt-token'
});

await adapter.connect();
```

### Strapi
```typescript
import { StrapiAdapter } from '@sightedit/cms-adapters';

const adapter = new StrapiAdapter({
  baseUrl: 'http://localhost:1337',
  apiToken: 'token'
});
```

### Sanity
```typescript
import { SanityAdapter } from '@sightedit/cms-adapters';

const adapter = new SanityAdapter({
  projectId: 'project-id',
  dataset: 'production',
  token: 'token'
});
```

### WordPress
```typescript
import { WordPressAdapter } from '@sightedit/cms-adapters';

const adapter = new WordPressAdapter({
  siteUrl: 'https://yoursite.com',
  username: 'user',
  password: 'app-password'
});
```

## 📊 Feature Comparison

| Feature | Contentful | Strapi | Sanity | WordPress |
|---------|:----------:|:------:|:------:|:---------:|
| Drafts | ✅ | ✅ | ✅ | ✅ |
| Versions | ✅ | ❌ | ✅ | ✅ |
| Assets | ✅ | ✅ | ✅ | ✅ |
| Search | ✅ | ✅ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| i18n | ✅ | ✅ | ✅ | Plugin |

## 📖 Full Documentation

See [CMS Adapters Documentation](./docs) for complete API reference and examples.

## License

MIT
