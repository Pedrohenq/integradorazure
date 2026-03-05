// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';

function StatCard({ label, value, sub, color = '#4a9eff', icon }) {
  return (
    <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24, flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, color: '#4a5568', fontWeight: 500, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
          <div style={{ fontSize: 36, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: '#4a5568', marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 28, opacity: 0.4 }}>{icon}</div>
      </div>
    </div>
  );
}

function FlowCard({ from, to, count, color }) {
  return (
    <div style={{ background: '#0f0f1a', border: `1px solid ${color}22`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ fontSize: 12, color: '#8892a4', background: '#1a1a2e', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>{from}</div>
      <div style={{ color, fontSize: 18 }}>→</div>
      <div style={{ fontSize: 12, color: '#8892a4', background: '#1a1a2e', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>{to}</div>
      <div style={{ marginLeft: 'auto', fontSize: 20, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>{count}</div>
    </div>
  );
}

export default function Dashboard() {
  const [logs, setLogs] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    setWebhookUrl(window.location.origin);
    async function load() {
      try {
        const [logsRes, mappingsRes] = await Promise.all([
          fetch('/api/get-logs'),
          fetch('/api/get-mappings'),
        ]);
        const logsData = await logsRes.json();
        const mappingsData = await mappingsRes.json();
        setLogs(logsData.logs || []);
        setMappings(mappingsData.mappings || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const glpiToAzure = logs.filter(l => l.type === 'glpi_to_azure');
  const azureToGlpi = logs.filter(l => l.type === 'azure_to_glpi');
  const errors = logs.filter(l => l.status === 'error');
  const success = logs.filter(l => l.status === 'success');

  const recentLogs = logs.slice(0, 8);

  return (
    <div style={{ padding: 32 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>Dashboard</h1>
        <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 14 }}>Visão geral da integração GLPI ↔ Azure DevOps</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <StatCard label="Mapeamentos Ativos" value={loading ? '...' : mappings.length} icon="⇄" color="#4a9eff" />
        <StatCard label="Sincronizações OK" value={loading ? '...' : success.length} icon="✓" color="#48bb78" />
        <StatCard label="Erros" value={loading ? '...' : errors.length} icon="✗" color="#fc8181" />
        <StatCard label="Total de Eventos" value={loading ? '...' : logs.length} icon="≡" color="#d69e2e" />
      </div>

      {/* Webhook URLs */}
      <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px', color: '#8892a4', letterSpacing: 1, textTransform: 'uppercase' }}>🔗 URLs dos Webhooks</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <WebhookUrl label="GLPI → Azure (configure no GLPI)" url={`${webhookUrl}/api/glpi-webhook`} color="#4a9eff" />
          <WebhookUrl label="Azure → GLPI (configure no Azure DevOps)" url={`${webhookUrl}/api/azure-webhook`} color="#f6ad55" />
        </div>
      </div>

      {/* Flow + Recent Logs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px', color: '#8892a4', letterSpacing: 1, textTransform: 'uppercase' }}>Fluxo de Dados</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FlowCard from="GLPI" to="Azure" count={glpiToAzure.length} color="#4a9eff" />
            <FlowCard from="Azure" to="GLPI" count={azureToGlpi.length} color="#f6ad55" />
          </div>
        </div>

        <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px', color: '#8892a4', letterSpacing: 1, textTransform: 'uppercase' }}>Últimos Eventos</h2>
          {loading ? (
            <div style={{ color: '#4a5568', fontSize: 14 }}>Carregando...</div>
          ) : recentLogs.length === 0 ? (
            <div style={{ color: '#4a5568', fontSize: 14 }}>Nenhum evento registrado ainda.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentLogs.map(log => (
                <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, background: '#0a0a0f', fontSize: 13 }}>
                  <span style={{ color: log.status === 'success' ? '#48bb78' : '#fc8181', fontSize: 10 }}>●</span>
                  <span style={{ color: '#8892a4', flex: 1 }}>{log.details?.action || log.type}</span>
                  <span style={{ color: '#4a5568', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                    {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WebhookUrl({ label, url, color }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <div style={{ fontSize: 12, color: '#4a5568', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{ flex: 1, background: '#0a0a0f', border: `1px solid ${color}33`, borderRadius: 6, padding: '8px 12px', fontSize: 12, color, fontFamily: "'JetBrains Mono', monospace", wordBreak: 'break-all' }}>
          {url}
        </code>
        <button onClick={copy} style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${color}44`, background: 'transparent', color, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
