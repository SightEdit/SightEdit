import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminPanel } from './AdminPanel';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminPanel mode="standalone" />
  </React.StrictMode>
);
