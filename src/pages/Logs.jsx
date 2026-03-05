// src/pages/Logs.jsx
import { useState, useEffect } from 'react';

const TYPE_LABELS = {
  glpi_to_azure: { label: 'GLPI → Azure', color: '#4a9eff' },
  azure_to_glpi: { label: 'Azure → GLPI', color: '#f6ad55' },
};

const ACTION_LABELS = {
  created: 'Chamado criado',
  comment_added: 'Comentário adicionado',
  status_change: 'Status alterado',
};

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/get-logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? logs : logs.filter(l => {
    if (filter === 'error') return l.status === 'error';
    if (filter === 'glpi_to_azure') return l.type === 'glpi_to_azure';
    if (filter === 'azure_to_glpi') return l.type === 'azure_to_glpi';
    return true;
  });

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>Logs de Sincronização</h1>
          <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 14 }}>Últimos 100 eventos registrados</p>
        </div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
          ↺ Atualizar
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { id: 'all', label: 'Todos' },
          { id: 'glpi_to_azure', label: 'GLPI → Azure' },
          { id: 'azure_to_glpi', label: 'Azure → GLPI' },
          { id: 'error', label: 'Erros' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '6px 14px', borderRadius: 20, border: '1px solid', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            background: filter === f.id ? '#4a9eff' : 'transparent',
            borderColor: filter === f.id ? '#4a9eff' : '#2a2a3e',
            color: filter === f.id ? '#fff' : '#8892a4',
          }}>{f.label}</button>
        ))}
        <span style={{ marginLeft: 'auto', color: '#4a5568', fontSize: 13, lineHeight: '32px' }}>{filtered.length} registros</span>
      </div>

      {/* Table */}
      <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0a0a0f' }}>
              {['Status', 'Direção', 'Ação', 'GLPI ID', 'Azure ID', 'Detalhes', 'Data/Hora'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#4a5568', letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid #1a1a2e' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#4a5568' }}>Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#4a5568' }}>Nenhum log encontrado.</td></tr>
            ) : filtered.map((log, i) => {
              const typeInfo = TYPE_LABELS[log.type] || { label: log.type, color: '#8892a4' };
              const action = ACTION_LABELS[log.details?.action] || log.details?.action || '—';
              return (
                <tr key={log.id} style={{ borderBottom: '1px solid #12121f', background: i % 2 === 0 ? 'transparent' : '#0c0c16' }}>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '3px 8px', borderRadius: 4, background: log.status === 'success' ? '#1a3a1a' : '#3a1a1a', color: log.status === 'success' ? '#48bb78' : '#fc8181' }}>
                      <span style={{ fontSize: 8 }}>●</span> {log.status === 'success' ? 'OK' : 'Erro'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontSize: 12, color: typeInfo.color, fontWeight: 500 }}>{typeInfo.label}</span>
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: '#8892a4' }}>{action}</td>
                  <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#4a9eff' }}>
                    {log.details?.glpiId ? `#${log.details.glpiId}` : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#f6ad55' }}>
                    {log.details?.azureId ? `#${log.details.azureId}` : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#fc8181', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.status === 'error' ? log.details?.error : (log.details?.azureUrl ? <a href={log.details.azureUrl} target="_blank" rel="noreferrer" style={{ color: '#48bb78' }}>Ver no Azure ↗</a> : '—')}
                  </td>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#4a5568', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                    {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
