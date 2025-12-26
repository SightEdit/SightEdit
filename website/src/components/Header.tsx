import React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="text-2xl font-bold gradient-text">SightEdit</div>
          <span className="text-xs bg-primary-500 text-white px-2 py-1 rounded">v2.0</span>
        </Link>
        <nav className="flex gap-6">
          <Link to="/" className="hover:text-primary-400">Home</Link>
          <Link to="/examples" className="hover:text-primary-400">Examples</Link>
          <Link to="/docs" className="hover:text-primary-400">Docs</Link>
          <a href="https://github.com/sightedit/sightedit" className="hover:text-primary-400">GitHub</a>
        </nav>
      </div>
    </header>
  );
}
