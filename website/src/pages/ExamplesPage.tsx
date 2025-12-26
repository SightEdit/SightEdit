import React, { useState } from 'react';
import BasicEditing from '../examples/BasicEditing';
import ThemeSwitching from '../examples/ThemeSwitching';
import DataTransforms from '../examples/DataTransforms';
import HookSystem from '../examples/HookSystem';

type ExampleKey = 'basic' | 'theme' | 'transforms' | 'hooks';

export default function ExamplesPage() {
  const [activeExample, setActiveExample] = useState<ExampleKey>('basic');

  const examples = {
    basic: {
      title: 'Basic Inline Editing',
      description: 'Simple text editing with contentEditable and state management',
      component: <BasicEditing />,
    },
    theme: {
      title: 'Theme Switching',
      description: 'Runtime theme changes with multiple color schemes',
      component: <ThemeSwitching />,
    },
    transforms: {
      title: 'Data Transforms',
      description: 'Transform and format data with built-in and custom transforms',
      component: <DataTransforms />,
    },
    hooks: {
      title: 'Hook System',
      description: 'Lifecycle events and hook system demonstration',
      component: <HookSystem />,
    },
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-12">
        <h1 className="text-4xl font-bold mb-4">Interactive Examples</h1>
        <p className="text-xl text-slate-400">
          Try SightEdit v2.0 features with live, interactive demos
        </p>
      </div>

      <div className="flex gap-3 mb-8 flex-wrap">
        {(Object.keys(examples) as ExampleKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveExample(key)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              activeExample === key
                ? 'bg-primary-600 text-white shadow-lg'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {examples[key].title}
          </button>
        ))}
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-semibold mb-2">{examples[activeExample].title}</h2>
        <p className="text-slate-400">{examples[activeExample].description}</p>
      </div>

      <div>{examples[activeExample].component}</div>

      <div className="mt-12 bg-slate-800/50 rounded-lg p-6 border border-slate-700">
        <h3 className="text-lg font-semibold mb-3">More Examples Coming Soon:</h3>
        <ul className="grid md:grid-cols-2 gap-3 text-sm">
          <li className="flex items-start gap-2">
            <span className="text-primary-400">•</span>
            <span>CMS Integration (Contentful, Strapi, Sanity)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-400">•</span>
            <span>Component Override (Custom UI)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-400">•</span>
            <span>GraphQL API Usage</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-400">•</span>
            <span>Visual Builder Admin Panel</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-400">•</span>
            <span>Developer Tools & Debug Panel</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary-400">•</span>
            <span>Batch Operations & Offline Support</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
