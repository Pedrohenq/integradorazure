// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

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
  const [syncing, setSyncing] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    setWebhookUrl(window.location.origin);
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
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

  async function handleManualSync() {
    setSyncing(true);
    const toastId = toast.loading('Sincronizando tickets do GLPI...');
    try {
      const res = await fetch('/api/sync-glpi', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const r = data.results;
        toast.success(
          `Sync concluído! ${r.created} criados, ${r.followupsSynced} followups, ${r.azureCommentsSynced} comentários Azure`,
          { id: toastId, duration: 5000 }
        );
        loadData();
      } else {
        toast.error(data.error || 'Erro na sincronização', { id: toastId });
      }
    } catch (e) {
      toast.error('Erro: ' + e.message, { id: toastId });
    }
    setSyncing(false);
  }

  const glpiToAzure = logs.filter(l => l.type === 'glpi_to_azure');
  const azureToGlpi = logs.filter(l => l.type === 'azure_to_glpi');
  const errors = logs.filter(l => l.status === 'error');
  const success = logs.filter(l => l.status === 'success');
  const recentLogs = logs.slice(0, 8);

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>Dashboard</h1>
          <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 14 }}>Visão geral da integração GLPI ↔ Azure DevOps</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={loadData} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
            ↺ Atualizar
          </button>
          <button onClick={handleManualSync} disabled={syncing} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: syncing ? '#1a3a1a' : 'linear-gradient(135deg, #48bb78, #2f855a)', color: '#fff', cursor: syncing ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}>
            {syncing ? '⟳ Sincronizando...' : '⚡ Sincronizar agora'}
          </button>
        </div>
      </div>

      {/* Aviso sobre polling */}
      <div style={{ background: '#1a2a1a', border: '1px solid #2a4a2a', borderRadius: 10, padding: '12px 18px', marginBottom: 24, fontSize: 13, color: '#68d391', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>🔄</span>
        <span>Sincronização automática ativa — o sistema busca novos tickets e comentários do GLPI a cada <strong>5 minutos</strong> automaticamente. Use "Sincronizar agora" para forçar imediatamente.</span>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <StatCard label="Mapeamentos Ativos" value={loading ? '...' : mappings.length} icon="⇄" color="#4a9eff" />
        <StatCard label="Sincronizações OK" value={loading ? '...' : success.length} icon="✓" color="#48bb78" />
        <StatCard label="Erros" value={loading ? '...' : errors.length} icon="✗" color="#fc8181" />
        <StatCard label="Total de Eventos" value={loading ? '...' : logs.length} icon="≡" color="#d69e2e" />
      </div>

      {/* Webhook URLs — só para Azure → GLPI */}
      <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px', color: '#8892a4', letterSpacing: 1, textTransform: 'uppercase' }}>🔗 URL do Webhook (Azure → GLPI)</h2>
        <p style={{ fontSize: 12, color: '#4a5568', margin: '0 0 14px' }}>
          Configure esta URL no Azure DevOps (Project Settings → Service Hooks) para sincronizar comentários do Azure para o GLPI em tempo real.
          O GLPI é sincronizado automaticamente via polling — não precisa de webhook no GLPI.
        </p>
        <WebhookUrl label="Azure → GLPI (configure no Azure DevOps → Service Hooks)" url={`${webhookUrl}/api/azure-webhook`} color="#f6ad55" />
      </div>

      {/* Flow + Recent Logs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
        <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px', color: '#8892a4', letterSpacing: 1, textTransform: 'uppercase' }}>Fluxo de Dados</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <FlowCard from="GLPI" to="Azure" count={glpiToAzure.length} color="#4a9eff" />
            <FlowCard from="Azure" to="GLPI" count={azureToGlpi.length} color="#f6ad55" />
          </div>
          <div style={{ marginTop: 16, padding: '12px', background: '#0a0a0f', borderRadius: 8, fontSize: 12, color: '#4a5568', lineHeight: 1.7 }}>
            <div style={{ color: '#48bb78', marginBottom: 4, fontWeight: 600 }}>✓ Como funciona (sem webhook GLPI):</div>
            <div>1. A cada 5 min, busca tickets novos no GLPI</div>
            <div>2. Cria Work Items no Azure automaticamente</div>
            <div>3. Sincroniza followups GLPI → Azure</div>
            <div>4. Azure comenta via Service Hook → GLPI</div>
          </div>
        </div>

        <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 16px', color: '#8892a4', letterSpacing: 1, textTransform: 'uppercase' }}>Últimos Eventos</h2>
          {loading ? (
            <div style={{ color: '#4a5568', fontSize: 14 }}>Carregando...</div>
          ) : recentLogs.length === 0 ? (
            <div style={{ color: '#4a5568', fontSize: 14 }}>Nenhum evento ainda. Clique em "Sincronizar agora" para começar.</div>
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
