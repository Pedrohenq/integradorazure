// src/pages/Mappings.jsx
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export default function Mappings() {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [config, setConfig] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [mRes, cRes] = await Promise.all([
        fetch('/api/get-mappings'),
        fetch('/api/save-config'),
      ]);
      const mData = await mRes.json();
      const cData = await cRes.json();
      setMappings(mData.mappings || []);
      setConfig(cData.config);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Remover este mapeamento?')) return;
    try {
      const res = await fetch('/api/get-mappings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        toast.success('Mapeamento removido');
        setMappings(prev => prev.filter(m => m.id !== id));
      } else {
        toast.error('Erro ao remover');
      }
    } catch (e) { toast.error(e.message); }
  };

  const filtered = mappings.filter(m =>
    m.glpiId?.includes(search) || m.azureId?.includes(search)
  );

  const azureBaseUrl = config ? `https://dev.azure.com/${config.azureOrg}/${config.azureProject}/_workitems/edit` : null;
  const glpiBaseUrl = config?.glpiUrl ? `${config.glpiUrl}/front/ticket.form.php?id=` : null;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>Mapeamentos</h1>
          <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 14 }}>Relação entre chamados GLPI e work items do Azure DevOps</p>
        </div>
        <button onClick={load} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #2a2a3e', background: 'transparent', color: '#8892a4', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
          ↺ Atualizar
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: '16px 24px', flex: 1 }}>
          <div style={{ fontSize: 11, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1 }}>Total Mapeado</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#4a9eff', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{mappings.length}</div>
        </div>
        <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: '16px 24px', flex: 3 }}>
          <div style={{ fontSize: 11, color: '#4a5568', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Como funciona</div>
          <div style={{ fontSize: 13, color: '#8892a4', lineHeight: 1.7 }}>
            Cada linha representa um chamado GLPI vinculado a um work item no Azure. Quando um novo chamado é criado no GLPI via webhook, o vínculo é criado automaticamente.
            Você pode remover vínculos manualmente se necessário.
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por ID GLPI ou Azure..."
          style={{ width: 300, background: '#0f0f1a', border: '1px solid #2a2a3e', borderRadius: 8, padding: '8px 14px', color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0a0a0f' }}>
              {['GLPI Ticket ID', 'Azure Work Item ID', 'Link GLPI', 'Link Azure', 'Criado em', 'Ações'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#4a5568', letterSpacing: 1, textTransform: 'uppercase', borderBottom: '1px solid #1a1a2e' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#4a5568' }}>Carregando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#4a5568' }}>
                {mappings.length === 0 ? 'Nenhum mapeamento ainda. Crie um chamado no GLPI para começar.' : 'Nenhum resultado para a busca.'}
              </td></tr>
            ) : filtered.map((m, i) => (
              <tr key={m.id} style={{ borderBottom: '1px solid #12121f', background: i % 2 === 0 ? 'transparent' : '#0c0c16' }}>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#4a9eff', fontWeight: 600 }}>#{m.glpiId}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#f6ad55', fontWeight: 600 }}>#{m.azureId}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {glpiBaseUrl ? (
                    <a href={`${glpiBaseUrl}${m.glpiId}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#4a9eff', textDecoration: 'none', padding: '3px 8px', border: '1px solid #4a9eff44', borderRadius: 4 }}>
                      Abrir no GLPI ↗
                    </a>
                  ) : <span style={{ color: '#4a5568', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {azureBaseUrl ? (
                    <a href={`${azureBaseUrl}/${m.azureId}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#f6ad55', textDecoration: 'none', padding: '3px 8px', border: '1px solid #f6ad5544', borderRadius: 4 }}>
                      Abrir no Azure ↗
                    </a>
                  ) : <span style={{ color: '#4a5568', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: '#4a5568', fontFamily: "'JetBrains Mono', monospace" }}>
                  {m.createdAt ? new Date(m.createdAt).toLocaleString('pt-BR') : '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button onClick={() => handleDelete(m.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fc818144', background: 'transparent', color: '#fc8181', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
