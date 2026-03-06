# GLPI ↔ Azure DevOps Integration

Sistema de integração bidirecional entre GLPI e Azure DevOps via webhooks.

## 🚀 O que este sistema faz

- **GLPI → Azure**: Quando um chamado é aberto no GLPI, cria automaticamente um Work Item no Azure DevOps
- **GLPI → Azure**: Comentários/followups adicionados no GLPI aparecem no Azure
- **Azure → GLPI**: Comentários adicionados no Azure aparecem como followups no GLPI
- **Azure → GLPI**: Mudanças de status no Azure geram comentários no GLPI

---

## 📋 Pré-requisitos

- Conta no [Netlify](https://netlify.com) (gratuita)
- Conta no [Firebase](https://firebase.google.com) (gratuita - Firestore)
- Acesso de administrador ao GLPI
- Acesso ao Azure DevOps com permissão para criar PAT e Service Hooks

---

## 🔧 Configuração do Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Crie um projeto (ou use o existente)
3. No menu lateral, clique em **Firestore Database** → **Criar banco de dados** → modo **produção**
4. Vá em **Configurações do Projeto** (engrenagem) → **Seus aplicativos** → **Web** → Registre um app
5. Copie o objeto `firebaseConfig` — você vai precisar dessas variáveis

### Regras do Firestore (cole em Firestore → Regras)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
> ⚠️ Para produção, adicione autenticação. As regras acima são para facilitar o setup inicial.

---

## 📦 Deploy no Netlify

### Opção 1: via Netlify CLI (recomendado)

```bash
# 1. Instale as dependências
npm install

# 2. Instale o Netlify CLI globalmente
npm install -g netlify-cli

# 3. Faça login no Netlify
netlify login

# 4. Crie um novo site
netlify init

# 5. Configure as variáveis de ambiente no Netlify Dashboard:
#    Site settings → Environment variables → Add variable
```

### Opção 2: via GitHub + Netlify

1. Faça upload do projeto para um repositório GitHub
2. No Netlify: **Add new site** → **Import from Git** → selecione o repositório
3. Build command: `npm run build`
4. Publish directory: `build`

### Variáveis de ambiente obrigatórias no Netlify

Configure em: **Site settings → Environment variables**

| Variável | Valor |
|----------|-------|
| `REACT_APP_FIREBASE_API_KEY` | Sua chave API do Firebase |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | `seu-projeto.firebaseapp.com` |
| `REACT_APP_FIREBASE_PROJECT_ID` | ID do projeto Firebase |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | `seu-projeto.appspot.com` |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | Sender ID do Firebase |
| `REACT_APP_FIREBASE_APP_ID` | App ID do Firebase |

---

## ⚙️ Configuração no painel da aplicação

Após o deploy, acesse sua aplicação e vá em **Configuração**:

### GLPI

1. **URL do GLPI**: URL base do seu servidor (ex: `https://glpi.empresa.com.br`)
2. **App Token**: Gerado em *Configuração → Configurações Gerais → API → Clientes API*
3. **User Token**: Gerado no perfil do usuário → *Gerar token de API* (recomendado)
4. Ou alternativamente: **Login** e **Senha** de um usuário administrador

#### Configurar webhook no GLPI:
- Vá em: *Configuração → Automações → Webhooks* → **Adicionar**
- URL: `https://sua-app.netlify.app/api/glpi-webhook`
- Tipo: **Ticket**
- Eventos: **Adição** e **Atualização**
- Header personalizado: `X-GLPI-Webhook-Secret: seu_secret` (se configurado)

### Azure DevOps

1. **Organização**: Nome em `dev.azure.com/ORGANIZAÇÃO`
2. **Projeto**: Nome exato do projeto
3. **PAT (Personal Access Token)**:
   - Acesse: *User Settings → Personal Access Tokens → New Token*
   - Permissões necessárias: **Work Items (Read & Write)**
4. **Tipo de Work Item**: `Task`, `Bug`, `User Story`, etc.

#### Configurar Service Hooks no Azure (Azure → GLPI):
- Vá em: *Project Settings → Service Hooks → +*
- Escolha: **Web Hooks**
- **Evento 1**: `Work item commented` → URL: `https://sua-app.netlify.app/api/azure-webhook`
- **Evento 2**: `Work item updated` → URL: `https://sua-app.netlify.app/api/azure-webhook`

---

## 🔄 Fluxo de dados

```
GLPI (novo chamado)
       │
       ▼ POST /api/glpi-webhook
  Netlify Function
       │
       ├─ Cria Work Item no Azure DevOps
       ├─ Salva mapeamento GLPI_ID ↔ AZURE_ID no Firestore
       └─ Registra log no Firestore

Azure (comentário/status)
       │
       ▼ POST /api/azure-webhook
  Netlify Function
       │
       ├─ Busca mapeamento no Firestore
       ├─ Adiciona followup no GLPI via API REST
       └─ Registra log no Firestore
```

---

## 🧪 Testando localmente

```bash
npm install
cp .env.example .env.local
# Preencha .env.local com seus dados Firebase

netlify dev
# Acesse: http://localhost:8888
```

Para testar os webhooks localmente, use [ngrok](https://ngrok.com):
```bash
ngrok http 8888
# Use a URL do ngrok como base para os webhooks
```

---

## 📁 Estrutura do projeto

```
glpi-azure-integration/
├── netlify/
│   └── functions/
│       ├── glpi-webhook.js      # Recebe webhooks do GLPI → cria no Azure
│       ├── azure-webhook.js     # Recebe webhooks do Azure → cria no GLPI
│       ├── save-config.js       # GET/POST configurações no Firestore
│       ├── get-logs.js          # Lista logs de sincronização
│       ├── get-mappings.js      # Lista/remove mapeamentos
│       └── test-connection.js   # Testa conexão com GLPI e Azure
├── src/
│   ├── pages/
│   │   ├── Dashboard.jsx        # Visão geral e URLs dos webhooks
│   │   ├── Config.jsx           # Formulário de configuração
│   │   ├── Logs.jsx             # Tabela de logs
│   │   └── Mappings.jsx         # Tabela de mapeamentos
│   ├── services/
│   │   └── firebase.js
│   ├── App.jsx
│   └── index.js
├── public/
│   └── index.html
├── netlify.toml
├── package.json
└── .env.example
```

---

## ❓ FAQ

**P: O GLPI não tem webhooks nativos, como resolver?**
R: GLPI 10.x tem webhooks nativos em *Configuração → Automações → Webhooks*. Para versões anteriores, use o plugin [Webhook](https://plugins.glpi-project.org/#/plugin/webhook) disponível no marketplace do GLPI.

**P: Posso usar com GLPI Cloud (SaaS)?**
R: Sim, desde que o GLPI Cloud permita configuração de webhooks e que a URL do Netlify seja acessível publicamente (o que já é por padrão).

**P: As senhas ficam seguras?**
R: As credenciais são salvas no Firestore da sua conta Firebase. O PAT e tokens são mascarados ao exibir na tela. Para produção, considere usar [Firebase Security Rules](https://firebase.google.com/docs/firestore/security/get-started) com autenticação.

**P: Como sei se o webhook está funcionando?**
R: Veja a aba **Logs** na aplicação. Cada evento processado (sucesso ou erro) é registrado lá com detalhes.
"# integradorazure" 
"# azureglpi" 
