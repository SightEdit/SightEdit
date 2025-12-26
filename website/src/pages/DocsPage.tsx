import React from 'react';

export default function DocsPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-8">Documentation</h1>
      <div className="prose prose-invert max-w-none">
        <h2>Getting Started</h2>
        <pre className="bg-slate-800 p-4 rounded"><code>npm install @sightedit/core</code></pre>
        
        <h2>Quick Example</h2>
        <pre className="bg-slate-800 p-4 rounded"><code>{`import SightEdit from '@sightedit/core';

SightEdit.init({
  endpoint: '/api/save',
  theme: 'dark'
});`}</code></pre>

        <h2>Packages</h2>
        <ul>
          <li><strong>@sightedit/core</strong> - Core library</li>
          <li><strong>@sightedit/react</strong> - React integration</li>
          <li><strong>@sightedit/admin</strong> - Visual Builder</li>
          <li><strong>@sightedit/cms-adapters</strong> - CMS integrations</li>
          <li><strong>@sightedit/graphql-server</strong> - GraphQL API</li>
          <li><strong>@sightedit/server-sdk</strong> - Custom backend SDK</li>
        </ul>

        <h2>Links</h2>
        <ul>
          <li><a href="https://github.com/sightedit/sightedit">GitHub Repository</a></li>
          <li><a href="https://github.com/sightedit/sightedit/blob/main/README.md">Full Documentation</a></li>
          <li><a href="https://github.com/sightedit/sightedit/blob/main/INSTALLATION.md">Installation Guide</a></li>
          <li><a href="https://github.com/sightedit/sightedit/blob/main/MIGRATION.md">Migration Guide</a></li>
        </ul>
      </div>
    </div>
  );
}
