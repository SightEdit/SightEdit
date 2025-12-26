import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ExamplesPage from './pages/ExamplesPage';
import DocsPage from './pages/DocsPage';
import Header from './components/Header';

function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/examples" element={<ExamplesPage />} />
        <Route path="/docs" element={<DocsPage />} />
      </Routes>
    </div>
  );
}

export default App;
