// src/App.jsx
import { useState } from 'react';
import Dashboard from './pages/Dashboard';
import Config from './pages/Config';
import Logs from './pages/Logs';
import Mappings from './pages/Mappings';
import { Toaster } from 'react-hot-toast';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬡' },
  { id: 'config', label: 'Configuração', icon: '⚙' },
  { id: 'mappings', label: 'Mapeamentos', icon: '⇄' },
  { id: 'logs', label: 'Logs', icon: '≡' },
];

export default function App() {
  const [page, setPage] = useState('dashboard');

  const pages = { dashboard: Dashboard, config: Config, logs: Logs, mappings: Mappings };
  const Page = pages[page];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a0f', color: '#e2e8f0', fontFamily: "'Space Grotesk', sans-serif" }}>
      <Toaster position="top-right" toastOptions={{ style: { background: '#1e1e2e', color: '#e2e8f0', border: '1px solid #2a2a3e' } }} />

      {/* Sidebar */}
      <aside style={{ width: 220, background: '#0f0f1a', borderRight: '1px solid #1a1a2e', display: 'flex', flexDirection: 'column', padding: '24px 0' }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 28px', borderBottom: '1px solid #1a1a2e' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 3, color: '#4a9eff', textTransform: 'uppercase', marginBottom: 6 }}>Integration Hub</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>GLPI ↔ Azure</div>
          <div style={{ fontSize: 11, color: '#4a5568', marginTop: 4 }}>DevOps Sync</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', marginBottom: 4, borderRadius: 8, border: 'none', cursor: 'pointer',
                background: page === n.id ? 'linear-gradient(135deg, #1a3a5c, #1a2a4a)' : 'transparent',
                color: page === n.id ? '#4a9eff' : '#8892a4',
                fontSize: 14, fontWeight: page === n.id ? 600 : 400,
                transition: 'all 0.15s', fontFamily: 'inherit',
                borderLeft: page === n.id ? '2px solid #4a9eff' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #1a1a2e' }}>
          <div style={{ fontSize: 11, color: '#2d3748' }}>v1.0.0 · Netlify + Firebase</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Page />
      </main>
    </div>
  );
}
