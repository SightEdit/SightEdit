import React, { useState } from 'react';

export default function BasicEditing() {
  const [content, setContent] = useState({
    title: 'Welcome to SightEdit v2.0',
    subtitle: 'The Complete Visual Editing Ecosystem',
    description: 'Click any text to edit it inline. Changes are saved automatically.',
  });

  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
        <h3 className="text-xl font-semibold mb-4 text-primary-400">Basic Inline Editing</h3>

        <div className="space-y-4">
          <div>
            <h1
              className="text-3xl font-bold cursor-pointer hover:bg-slate-700/30 rounded p-2 transition"
              contentEditable={isEditing}
              suppressContentEditableWarning
              onBlur={(e) => setContent({ ...content, title: e.currentTarget.textContent || '' })}
            >
              {content.title}
            </h1>
          </div>

          <div>
            <h2
              className="text-xl text-slate-300 cursor-pointer hover:bg-slate-700/30 rounded p-2 transition"
              contentEditable={isEditing}
              suppressContentEditableWarning
              onBlur={(e) => setContent({ ...content, subtitle: e.currentTarget.textContent || '' })}
            >
              {content.subtitle}
            </h2>
          </div>

          <div>
            <p
              className="text-slate-400 cursor-pointer hover:bg-slate-700/30 rounded p-2 transition"
              contentEditable={isEditing}
              suppressContentEditableWarning
              onBlur={(e) => setContent({ ...content, description: e.currentTarget.textContent || '' })}
            >
              {content.description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`px-4 py-2 rounded font-medium transition ${
              isEditing
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-primary-600 hover:bg-primary-700 text-white'
            }`}
          >
            {isEditing ? '✓ Done Editing' : '✏️ Start Editing'}
          </button>

          <button
            onClick={() => setContent({
              title: 'Welcome to SightEdit v2.0',
              subtitle: 'The Complete Visual Editing Ecosystem',
              description: 'Click any text to edit it inline. Changes are saved automatically.',
            })}
            className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-white transition"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <h4 className="text-sm font-semibold mb-2 text-slate-300">Current State:</h4>
        <pre className="text-xs bg-slate-900 p-3 rounded overflow-x-auto">
          <code>{JSON.stringify(content, null, 2)}</code>
        </pre>
      </div>
    </div>
  );
}
