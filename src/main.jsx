import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { StoreProvider } from './lib/store';
import { NotifyProvider } from './lib/notify';
import './index.css';

// When deployed to a GitHub Pages project site the app lives under /<repo>/,
// so the router has to be told about that prefix or every route 404s.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <NotifyProvider>
        <AuthProvider>
          <StoreProvider>
            <App />
          </StoreProvider>
        </AuthProvider>
      </NotifyProvider>
    </BrowserRouter>
  </React.StrictMode>
);
