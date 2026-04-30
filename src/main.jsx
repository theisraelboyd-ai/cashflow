import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for offline + add-to-home-screen support.
// Use a relative URL so it works correctly under /cashflow/ on GitHub Pages.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // import.meta.env.BASE_URL resolves to './' or '/' depending on Vite build
    const swUrl = new URL('sw.js', window.location.href).href;
    navigator.serviceWorker
      .register(swUrl)
      .catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
  });
}
