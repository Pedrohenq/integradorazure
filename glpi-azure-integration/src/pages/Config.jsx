// src/pages/Config.jsx
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

function Section({ title, icon, children, accent = '#4a9eff' }) {
  return (
    <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: 28, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, paddingBottom: 16, borderBottom: '1px solid #1a1a2e' }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>{title}</h2>
        <div style={{ height: 2, flex: 1, background: `linear-gradient(90deg, ${accent}44, transparent)`, marginLeft: 8 }} />
      </div>
      {children}
    </div>
  );
}

function Field({ label, name, value, onChange, type = 'text', placeholder, hint, required }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#8892a4', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#fc8181' }}>*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          width: '100%', boxSizing: 'border-box', background: '#0a0a0f', border: '1px solid #2a2a3e',
          borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 14,
          fontFamily: name.includes('Token') || name.includes('Pat') || name.includes('Password') ? "'JetBrains Mono', monospace" : 'inherit',
          outline: 'none', transition: 'border-color 0.15s',
        }}
        onFocus={e => e.target.style.borderColor = '#4a9eff'}
        onBlur={e => e.target.style.borderColor = '#2a2a3e'}
      />
      {hint && <div style={{ fontSize: 11, color: '#4a5568', marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>{children}</div>;
}

export default function Config() {
  const [form, setForm] = useState({
    glpiUrl: '', glpiAppToken: '', glpiUserToken: '', glpiLogin: '', glpiPassword: '',
    azureOrg: '', azureProject: '', azurePat: '', azureWorkItemType: 'Task', azureAreaPath: '', azureIterationPath: '',
    webhookSecret: '',
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/save-config')
      .then(r => r.json())
      .then(data => {
        if (data.config) setForm(prev => ({ ...prev, ...data.config }));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/save-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) toast.success(data.message || 'Configuração salva!');
      else toast.error(data.error || 'Erro ao salvar');
    } catch (e) {
      toast.error('Erro de conexão: ' + e.message);
    }
    setSaving(false);
  };

  const handleTest = async (target) => {
    setTesting(target);
    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();

      if (target === 'glpi' || target === 'all') {
        if (data.glpi?.success) toast.success(data.glpi.message);
        else toast.error(data.glpi?.message || 'Falha no GLPI');
      }
      if (target === 'azure' || target === 'all') {
        if (data.azure?.success) toast.success(data.azure.message);
        else toast.error(data.azure?.message || 'Falha no Azure');
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    }
    setTesting('');
  };

  if (!loaded) return <div style={{ padding: 32, color: '#4a5568' }}>Carregando configurações...</div>;

  const appUrl = window.location.origin;

  return (
    <div style={{ padding: 32, maxWidth: 860 }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>Configuração</h1>
        <p style={{ margin: '6px 0 0', color: '#4a5568', fontSize: 14 }}>Configure as credenciais e parâmetros da integração</p>
      </div>

      {/* GLPI */}
      <Section title="GLPI" icon="🎫" accent="#4a9eff">
        <div style={{ background: '#0a0a1a', border: '1px solid #1a2a4a', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#4a9eff', lineHeight: 1.8 }}>
          <strong>📋 O que você precisa no GLPI:</strong><br/>
          1. Ative a API REST em: <em>Configuração → Configurações Gerais → API</em> → Habilitar API REST = <strong>Sim</strong><br/>
          2. Crie um <strong>App Token</strong> na mesma tela → Clientes API → Adicionar<br/>
          3. Crie um <strong>User Token</strong> em: perfil do usuário → <em>Gerar token de API</em><br/>
          4. Configure o webhook em: <em>Configuração → Automações → Webhooks</em> → URL: <code style={{ background: '#0a0a0f', padding: '2px 6px', borderRadius: 4 }}>{appUrl}/api/glpi-webhook</code>
        </div>
        <Grid>
          <Field label="URL do GLPI" name="glpiUrl" value={form.glpiUrl} onChange={handleChange} placeholder="https://glpi.suaempresa.com.br" hint="URL base do servidor GLPI (sem barra no final)" required />
          <Field label="App Token" name="glpiAppToken" value={form.glpiAppToken} onChange={handleChange} placeholder="Token do cliente API" hint="Gerado em: Configuração → API → Clientes API" required />
          <Field label="User Token (recomendado)" name="glpiUserToken" value={form.glpiUserToken} onChange={handleChange} placeholder="Deixe vazio para usar login/senha" hint="Gerado no perfil do usuário → API" type="password" />
          <div />
          <Field label="Login (alternativo)" name="glpiLogin" value={form.glpiLogin} onChange={handleChange} placeholder="usuario@empresa.com" hint="Use se não tiver User Token" />
          <Field label="Senha (alternativo)" name="glpiPassword" value={form.glpiPassword} onChange={handleChange} placeholder="••••••••" type="password" hint="Senha do usuário GLPI" />
        </Grid>
        <button onClick={() => handleTest('glpi')} disabled={testing === 'glpi'} style={btnSecondary('#4a9eff')}>
          {testing === 'glpi' ? 'Testando...' : '⚡ Testar conexão com GLPI'}
        </button>
      </Section>

      {/* Azure DevOps */}
      <Section title="Azure DevOps" icon="☁️" accent="#f6ad55">
        <div style={{ background: '#1a160a', border: '1px solid #4a3a1a', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#f6ad55', lineHeight: 1.8 }}>
          <strong>📋 O que você precisa no Azure DevOps:</strong><br/>
          1. Acesse: <em>dev.azure.com/SuaOrg → User Settings → Personal Access Tokens</em><br/>
          2. Crie um PAT com permissões: <strong>Work Items (Read & Write)</strong> e <strong>Project and Team (Read)</strong><br/>
          3. Para receber comentários do Azure no GLPI, configure Service Hooks em:<br/>
          &nbsp;&nbsp;→ <em>Project Settings → Service Hooks → + → Web Hooks</em><br/>
          &nbsp;&nbsp;→ Evento: <strong>Work item commented</strong> e <strong>Work item updated</strong><br/>
          &nbsp;&nbsp;→ URL: <code style={{ background: '#0a0a0f', padding: '2px 6px', borderRadius: 4 }}>{appUrl}/api/azure-webhook</code>
        </div>
        <Grid>
          <Field label="Organização" name="azureOrg" value={form.azureOrg} onChange={handleChange} placeholder="minha-empresa" hint="Nome da organização em dev.azure.com/ORG" required />
          <Field label="Projeto" name="azureProject" value={form.azureProject} onChange={handleChange} placeholder="NomeDoProjeto" hint="Nome exato do projeto no Azure DevOps" required />
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Personal Access Token (PAT)" name="azurePat" value={form.azurePat} onChange={handleChange} placeholder="Token de acesso pessoal" type="password" hint="Gerado em: User Settings → Personal Access Tokens — precisa de permissão: Work Items (Read & Write)" required />
          </div>
          <Field label="Tipo de Work Item" name="azureWorkItemType" value={form.azureWorkItemType} onChange={handleChange} placeholder="Task" hint="Ex: Task, Bug, User Story, Issue..." />
          <Field label="Area Path (opcional)" name="azureAreaPath" value={form.azureAreaPath} onChange={handleChange} placeholder="Projeto\\Time" hint="Caminho de área do Azure (opcional)" />
          <Field label="Iteration Path (opcional)" name="azureIterationPath" value={form.azureIterationPath} onChange={handleChange} placeholder="Projeto\\Sprint 1" hint="Sprint ou iteração (opcional)" />
        </Grid>
        <button onClick={() => handleTest('azure')} disabled={testing === 'azure'} style={btnSecondary('#f6ad55')}>
          {testing === 'azure' ? 'Testando...' : '⚡ Testar conexão com Azure'}
        </button>
      </Section>

      {/* Webhook Security */}
      <Section title="Segurança do Webhook" icon="🔒" accent="#9f7aea">
        <Field
          label="Webhook Secret (opcional)"
          name="webhookSecret"
          value={form.webhookSecret}
          onChange={handleChange}
          placeholder="string-secreta-aleatória"
          type="password"
          hint={`Se preenchido, o GLPI deve enviar este valor no header X-GLPI-Webhook-Secret ou como ?secret=VALOR na URL. Deixe vazio para aceitar qualquer requisição.`}
        />
      </Section>

      {/* Save */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button onClick={() => handleTest('all')} disabled={!!testing} style={btnSecondary('#48bb78')}>
          {testing === 'all' ? 'Testando tudo...' : '⚡ Testar ambas as conexões'}
        </button>
        <button onClick={handleSave} disabled={saving} style={btnPrimary}>
          {saving ? 'Salvando...' : '💾 Salvar configuração'}
        </button>
      </div>
    </div>
  );
}

const btnPrimary = {
  padding: '11px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, #4a9eff, #2563eb)', color: '#fff',
  fontSize: 14, fontWeight: 600, fontFamily: 'inherit', transition: 'opacity 0.15s',
};

const btnSecondary = (color) => ({
  padding: '8px 18px', borderRadius: 8, border: `1px solid ${color}44`, cursor: 'pointer',
  background: 'transparent', color, fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
  transition: 'all 0.15s', marginTop: 4,
});
