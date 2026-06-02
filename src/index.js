import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global resets
const style = document.createElement('style');
style.textContent = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #F2F4F7; }
  a { text-decoration: none; }
  input, select, button, textarea { font-family: inherit; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #f1f1f1; }
  ::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #aaa; }
`;
document.head.appendChild(style);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
