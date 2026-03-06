// netlify/functions/sync-glpi.js
// Polling agendado: busca tickets novos/atualizados no GLPI e sincroniza com Azure
// Chamado pelo Netlify Scheduled Functions (a cada 5 minutos)
// Também pode ser chamado manualmente via POST /api/sync-glpi

const { db } = require('./_firebase');

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

// ── GLPI helpers ──────────────────────────────────────────────────────────────

async function glpiSession(config) {
  const { glpiUrl, glpiAppToken, glpiUserToken, glpiLogin, glpiPassword } = config;
  const headers = { 'App-Token': glpiAppToken, 'Content-Type': 'application/json' };
  if (glpiUserToken) {
    headers['Authorization'] = `user_token ${glpiUserToken}`;
  } else {
    headers['Authorization'] = `Basic ${Buffer.from(`${glpiLogin}:${glpiPassword}`).toString('base64')}`;
  }
  const res = await fetch(`${glpiUrl}/apirest.php/initSession`, { headers });
  if (!res.ok) throw new Error(`GLPI auth failed: ${res.status}`);
  const data = await res.json();
  return data.session_token;
}

async function glpiKillSession(config, sessionToken) {
  try {
    await fetch(`${config.glpiUrl}/apirest.php/killSession`, {
      headers: { 'App-Token': config.glpiAppToken, 'Session-Token': sessionToken },
    });
  } catch (e) { /* ignora */ }
}

async function glpiGetTickets(config, sessionToken, lastSync) {
  const { glpiUrl, glpiAppToken } = config;

  // Busca tickets modificados desde lastSync
  const since = lastSync ? new Date(lastSync).toISOString().replace('T', ' ').substring(0, 19) : null;

  let url = `${glpiUrl}/apirest.php/Ticket?expand_dropdowns=true&get_hateoas=false&range=0-50&order=DESC&sort=15`;
  if (since) {
    url += `&searchText[15]=${encodeURIComponent(since)}`;
  }

  const res = await fetch(url, {
    headers: {
      'App-Token': glpiAppToken,
      'Session-Token': sessionToken,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 206 || res.ok) {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
  return [];
}

async function glpiGetTicketFollowups(config, sessionToken, ticketId) {
  const { glpiUrl, glpiAppToken } = config;
  const res = await fetch(`${glpiUrl}/apirest.php/Ticket/${ticketId}/ITILFollowup`, {
    headers: { 'App-Token': glpiAppToken, 'Session-Token': sessionToken },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function glpiAddFollowup(config, sessionToken, ticketId, content) {
  const { glpiUrl, glpiAppToken } = config;
  const res = await fetch(`${glpiUrl}/apirest.php/Ticket/${ticketId}/ITILFollowup`, {
    method: 'POST',
    headers: {
      'App-Token': glpiAppToken,
      'Session-Token': sessionToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: { items_id: parseInt(ticketId), itemtype: 'Ticket', content, is_private: 0 },
    }),
  });
  if (!res.ok) throw new Error(`GLPI followup error: ${res.status}`);
  return res.json();
}

// ── Azure helpers ─────────────────────────────────────────────────────────────

async function azureCreateWorkItem(config, ticket) {
  const { azureOrg, azureProject, azurePat, azureWorkItemType, azureAreaPath, azureIterationPath } = config;
  const token = Buffer.from(`:${azurePat}`).toString('base64');
  const type = azureWorkItemType || 'Task';

  const priorityMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4 };
  const body = [
    { op: 'add', path: '/fields/System.Title', value: `[GLPI #${ticket.id}] ${ticket.name}` },
    { op: 'add', path: '/fields/System.Description', value: `<b>Chamado GLPI:</b> #${ticket.id}<br/><b>Solicitante:</b> ${ticket.users_id_recipient || 'N/A'}<br/><b>Status:</b> ${ticket.status || 'N/A'}<br/><hr/>${ticket.content || ''}` },
    { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: priorityMap[ticket.priority] || 3 },
    { op: 'add', path: '/fields/System.Tags', value: `GLPI;glpi-${ticket.id}` },
  ];
  if (azureAreaPath) body.push({ op: 'add', path: '/fields/System.AreaPath', value: azureAreaPath });
  if (azureIterationPath) body.push({ op: 'add', path: '/fields/System.IterationPath', value: azureIterationPath });

  const res = await fetch(
    `https://dev.azure.com/${azureOrg}/${azureProject}/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json-patch+json', Authorization: `Basic ${token}` },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure create error: ${res.status} - ${err.substring(0, 200)}`);
  }
  return res.json();
}

async function azureGetComments(config, workItemId) {
  const { azureOrg, azureProject, azurePat } = config;
  const token = Buffer.from(`:${azurePat}`).toString('base64');
  const res = await fetch(
    `https://dev.azure.com/${azureOrg}/${azureProject}/_apis/wit/workitems/${workItemId}/comments?api-version=7.1-preview.3`,
    { headers: { Authorization: `Basic ${token}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.comments || [];
}

async function azureAddComment(config, workItemId, text) {
  const { azureOrg, azureProject, azurePat } = config;
  const token = Buffer.from(`:${azurePat}`).toString('base64');
  const res = await fetch(
    `https://dev.azure.com/${azureOrg}/${azureProject}/_apis/wit/workitems/${workItemId}/comments?api-version=7.1-preview.3`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${token}` },
      body: JSON.stringify({ text }),
    }
  );
  if (!res.ok) throw new Error(`Azure comment error: ${res.status}`);
  return res.json();
}

// ── Main sync ─────────────────────────────────────────────────────────────────

async function runSync() {
  const configSnap = await db.get('config', 'integration');
  if (!configSnap.exists) throw new Error('Configuração não encontrada');
  const config = configSnap.data();

  // Lê estado da última sincronização
  const stateSnap = await db.get('sync_state', 'last_sync');
  const state = stateSnap.exists ? stateSnap.data() : {};
  const lastSync = state.lastSync || null;
  const processedFollowups = state.processedFollowups || [];
  const processedAzureComments = state.processedAzureComments || [];

  const results = { created: 0, followupsSynced: 0, azureCommentsSynced: 0, errors: [] };

  let sessionToken;
  try {
    sessionToken = await glpiSession(config);
  } catch (e) {
    throw new Error(`Falha ao autenticar no GLPI: ${e.message}`);
  }

  try {
    // 1. Busca tickets recentes do GLPI
    const tickets = await glpiGetTickets(config, sessionToken, lastSync);

    for (const ticket of tickets) {
      try {
        // Verifica se já tem mapeamento
        const existing = await db.query('ticket_mappings', 'glpiId', '==', String(ticket.id));

        let azureId;

        if (existing.length === 0) {
          // Cria novo work item no Azure
          const azureItem = await azureCreateWorkItem(config, ticket);
          azureId = azureItem.id;

          await db.add('ticket_mappings', {
            glpiId: String(ticket.id),
            azureId: String(azureId),
          });

          await db.add('sync_logs', {
            type: 'glpi_to_azure',
            status: 'success',
            details: { action: 'created', glpiId: ticket.id, azureId, source: 'polling' },
          });

          results.created++;
        } else {
          azureId = existing[0].data().azureId;
        }

        // 2. Sincroniza followups do GLPI → Azure
        const followups = await glpiGetTicketFollowups(config, sessionToken, ticket.id);
        for (const fu of followups) {
          const fuKey = `glpi-${ticket.id}-fu-${fu.id}`;
          if (processedFollowups.includes(fuKey)) continue;

          const comment = `<b>[GLPI] Followup #${fu.id}:</b><br/>${fu.content || ''}`;
          await azureAddComment(config, azureId, comment);

          processedFollowups.push(fuKey);
          results.followupsSynced++;
        }

        // 3. Sincroniza comentários do Azure → GLPI
        const azureComments = await azureGetComments(config, azureId);
        for (const comment of azureComments) {
          const commentKey = `azure-${azureId}-c-${comment.id}`;
          if (processedAzureComments.includes(commentKey)) continue;
          // Ignora comentários que vieram do próprio GLPI
          if (comment.text && comment.text.includes('[GLPI]')) {
            processedAzureComments.push(commentKey);
            continue;
          }

          const author = comment.createdBy?.displayName || 'Azure';
          const glpiComment = `[Azure DevOps - ${author}]:\n${comment.text || ''}`;
          await glpiAddFollowup(config, sessionToken, ticket.id, glpiComment);

          processedAzureComments.push(commentKey);
          results.azureCommentsSynced++;
        }

      } catch (e) {
        results.errors.push({ ticketId: ticket.id, error: e.message });
        await db.add('sync_logs', {
          type: 'sync_error',
          status: 'error',
          details: { ticketId: ticket.id, error: e.message },
        });
      }
    }

    // Salva estado atualizado (mantém só os últimos 500 IDs para não crescer demais)
    await db.set('sync_state', 'last_sync', {
      lastSync: new Date().toISOString(),
      processedFollowups: processedFollowups.slice(-500),
      processedAzureComments: processedAzureComments.slice(-500),
    });

  } finally {
    await glpiKillSession(config, sessionToken);
  }

  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  // Aceita GET e POST (GET para scheduled, POST para manual)
  try {
    const results = await runSync();

    await db.add('sync_logs', {
      type: 'polling_sync',
      status: 'success',
      details: {
        ...results,
        triggeredBy: event.httpMethod === 'POST' ? 'manual' : 'scheduled',
      },
    });

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({ message: 'Sincronização concluída', results }),
    };
  } catch (e) {
    console.error('Sync error:', e);
    await db.add('sync_logs', {
      type: 'polling_sync',
      status: 'error',
      details: { error: e.message },
    }).catch(() => {});

    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
