import React from 'react';

export default function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="hero-gradient py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-6xl font-bold mb-6">
            SightEdit v2.0
          </h1>
          <p className="text-2xl mb-8 text-white/90">
            Complete Visual Editing Ecosystem
          </p>
          <p className="text-xl mb-12 max-w-3xl mx-auto text-white/80">
            Developer-focused inline editing with Visual Builder, Theme System, CMS Adapters, and GraphQL
          </p>
          <div className="flex gap-4 justify-center">
            <a href="/sightedit/examples" className="bg-white text-purple-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100">
              View Examples
            </a>
            <a href="https://github.com/sightedit/sightedit" className="bg-purple-600/30 text-white border border-white/30 px-8 py-3 rounded-lg font-semibold hover:bg-purple-600/50">
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-800/50">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold mb-12 text-center">Key Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <div key={i} className="bg-slate-800 p-6 rounded-lg border border-slate-700">
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="grid md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i}>
                <div className="text-5xl font-bold text-primary-400 mb-2">{stat.value}</div>
                <div className="text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const features = [
  { icon: '🎨', title: 'Visual Builder', description: 'No-code schema and theme configuration' },
  { icon: '🎭', title: 'Theme System', description: 'CSS-in-JS with 5 presets and dark mode' },
  { icon: '🔌', title: 'CMS Adapters', description: 'Contentful, Strapi, Sanity, WordPress' },
  { icon: '📡', title: 'GraphQL API', description: 'Real-time subscriptions via WebSocket' },
  { icon: '⚙️', title: 'Customization', description: '40+ hooks, 12 transforms, 11 components' },
  { icon: '🛠️', title: 'Dev Tools', description: 'Debug panel and performance monitor' },
];

const stats = [
  { value: '25K+', label: 'Lines of Code' },
  { value: '6', label: 'Packages' },
  { value: '4', label: 'CMS Integrations' },
  { value: '100%', label: 'TypeScript' },
];
