import React, { useState } from 'react';

interface LogEntry {
  id: number;
  hook: string;
  timestamp: string;
  data: any;
}

export default function HookSystem() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [value, setValue] = useState('Sample Content');
  const [enabledHooks, setEnabledHooks] = useState({
    beforeSave: true,
    afterSave: true,
    beforeEdit: true,
    afterEdit: true,
  });

  const addLog = (hook: string, data: any) => {
    const entry: LogEntry = {
      id: Date.now(),
      hook,
      timestamp: new Date().toLocaleTimeString(),
      data,
    };
    setLogs((prev) => [entry, ...prev].slice(0, 10));
  };

  const handleEdit = () => {
    if (enabledHooks.beforeEdit) {
      addLog('beforeEdit', { value });
    }
    // Simulate editing
    if (enabledHooks.afterEdit) {
      addLog('afterEdit', { value });
    }
  };

  const handleSave = () => {
    if (enabledHooks.beforeSave) {
      const modified = { original: value, modified: value.toUpperCase() };
      addLog('beforeSave', modified);
    }
    // Simulate save
    setTimeout(() => {
      if (enabledHooks.afterSave) {
        addLog('afterSave', { saved: true, timestamp: Date.now() });
      }
    }, 500);
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
        <h3 className="text-xl font-semibold mb-4 text-primary-400">Hook System Demo</h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {Object.keys(enabledHooks).map((hook) => (
            <label key={hook} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={enabledHooks[hook as keyof typeof enabledHooks]}
                onChange={(e) => setEnabledHooks({ ...enabledHooks, [hook]: e.target.checked })}
                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm font-mono">{hook}</span>
            </label>
          ))}
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
          />

          <div className="flex gap-3">
            <button
              onClick={handleEdit}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
            >
              Trigger Edit Hooks
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition"
            >
              Trigger Save Hooks
            </button>
            <button
              onClick={clearLogs}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded font-medium transition"
            >
              Clear Logs
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-300">Hook Event Log:</h4>
          <span className="text-xs text-slate-500">{logs.length} events</span>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              No events yet. Click a button to trigger hooks.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="bg-slate-900 p-3 rounded text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-primary-400">{log.hook}</span>
                  <span className="text-slate-500">{log.timestamp}</span>
                </div>
                <pre className="text-slate-400 overflow-x-auto">
                  {JSON.stringify(log.data, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
        <h4 className="text-sm font-semibold mb-2 text-slate-300">Available Hooks (20+):</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs font-mono">
          <div className="text-green-400">beforeSave</div>
          <div className="text-green-400">afterSave</div>
          <div className="text-blue-400">beforeEdit</div>
          <div className="text-blue-400">afterEdit</div>
          <div className="text-purple-400">value:beforeChange</div>
          <div className="text-purple-400">value:afterChange</div>
          <div className="text-orange-400">network:beforeRequest</div>
          <div className="text-orange-400">network:afterRequest</div>
          <div className="text-pink-400">ui:toolbarRender</div>
          <div className="text-pink-400">ui:modalOpen</div>
          <div className="text-yellow-400">schema:beforeUpdate</div>
          <div className="text-yellow-400">theme:afterChange</div>
        </div>
      </div>
    </div>
  );
}
