import React, { useState } from 'react';

const transforms = {
  uppercase: (value: string) => value.toUpperCase(),
  lowercase: (value: string) => value.toLowerCase(),
  capitalize: (value: string) => value.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
  slugify: (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  reverse: (value: string) => value.split('').reverse().join(''),
};

type TransformKey = keyof typeof transforms;

export default function DataTransforms() {
  const [input, setInput] = useState('Hello World from SightEdit');
  const [selectedTransform, setSelectedTransform] = useState<TransformKey>('slugify');

  const transformedValue = transforms[selectedTransform](input);

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
        <h3 className="text-xl font-semibold mb-4 text-primary-400">Data Transformation Pipeline</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Input Value:</label>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              placeholder="Enter text to transform..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Select Transform:</label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(transforms) as TransformKey[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedTransform(key)}
                  className={`px-3 py-2 rounded text-sm font-medium transition ${
                    selectedTransform === key
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 border-2 border-primary-500">
            <label className="block text-sm font-medium mb-2 text-primary-400">Transformed Output:</label>
            <p className="text-lg font-mono text-green-400">{transformedValue}</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <h4 className="text-sm font-semibold mb-3 text-slate-300">Built-in Transforms:</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-slate-900 p-3 rounded">
            <div className="text-xs font-mono text-primary-400 mb-1">Sanitizer</div>
            <div className="text-xs text-slate-400">XSS prevention & HTML sanitization</div>
          </div>
          <div className="bg-slate-900 p-3 rounded">
            <div className="text-xs font-mono text-primary-400 mb-1">Markdown</div>
            <div className="text-xs text-slate-400">Convert Markdown to HTML</div>
          </div>
          <div className="bg-slate-900 p-3 rounded">
            <div className="text-xs font-mono text-primary-400 mb-1">Image Optimizer</div>
            <div className="text-xs text-slate-400">Compress & resize images</div>
          </div>
          <div className="bg-slate-900 p-3 rounded">
            <div className="text-xs font-mono text-primary-400 mb-1">Currency</div>
            <div className="text-xs text-slate-400">Format currency values</div>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <h4 className="text-sm font-semibold mb-2 text-slate-300">Example Transform Code:</h4>
        <pre className="text-xs bg-slate-900 p-3 rounded overflow-x-auto">
          <code>{`sightEdit.registerTransform({
  name: 'slugify',
  transform: (value) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
});`}</code>
        </pre>
      </div>
    </div>
  );
}
