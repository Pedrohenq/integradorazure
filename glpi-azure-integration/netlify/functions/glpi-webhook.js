// netlify/functions/glpi-webhook.js
// Recebe webhooks do GLPI e cria/atualiza work items no Azure DevOps
const { db } = require('./_firebase');

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

async function logSync(type, status, details) {
  try {
    await db.add('sync_logs', { type, status, details });
  } catch (e) { console.error('log error:', e.message); }
}

async function createAzureWorkItem(config, ticket) {
  const { azureOrg, azureProject, azurePat, azureWorkItemType, azureAreaPath, azureIterationPath } = config;
  const token = Buffer.from(`:${azurePat}`).toString('base64');
  const url = `https://dev.azure.com/${azureOrg}/${azureProject}/_apis/wit/workitems/$${encodeURIComponent(azureWorkItemType || 'Task')}?api-version=7.1`;

  const priorityMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4 };
  const body = [
    { op: 'add', path: '/fields/System.Title', value: `[GLPI #${ticket.id}] ${ticket.name}` },
    { op: 'add', path: '/fields/System.Description', value: `<b>Chamado GLPI:</b> #${ticket.id}<br/><b>Solicitante:</b> ${ticket.requester || 'N/A'}<br/><b>Categoria:</b> ${ticket.category || 'N/A'}<br/><hr/>${ticket.content || ''}` },
    { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: priorityMap[ticket.priority] || 3 },
    { op: 'add', path: '/fields/System.Tags', value: `GLPI;glpi-${ticket.id}` },
  ];
  if (azureAreaPath) body.push({ op: 'add', path: '/fields/System.AreaPath', value: azureAreaPath });
  if (azureIterationPath) body.push({ op: 'add', path: '/fields/System.IterationPath', value: azureIterationPath });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json-patch+json', Authorization: `Basic ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Azure API ${res.status}: ${(await res.text()).substring(0, 200)}`);
  return res.json();
}

async function addAzureComment(config, azureId, comment) {
  const { azureOrg, azureProject, azurePat } = config;
  const token = Buffer.from(`:${azurePat}`).toString('base64');
  const url = `https://dev.azure.com/${azureOrg}/${azureProject}/_apis/wit/workitems/${azureId}/comments?api-version=7.1-preview.3`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${token}` },
    body: JSON.stringify({ text: comment }),
  });
  if (!res.ok) throw new Error(`Azure comment ${res.status}: ${(await res.text()).substring(0, 200)}`);
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const snap = await db.get('config', 'integration');
    if (!snap.exists) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Configuração não encontrada' }) };
    const config = snap.data();

    // Validar secret
    const secret = event.headers['x-glpi-webhook-secret'] || event.queryStringParameters?.secret;
    if (config.webhookSecret && secret !== config.webhookSecret) {
      return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    let payload;
    try { payload = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { event: glpiEvent, items_id, itemtype } = payload;
    if (itemtype && itemtype !== 'Ticket') {
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: 'Ignored' }) };
    }

    const glpiTicket = payload.ticket || payload.data || payload;
    const ticketId = String(items_id || glpiTicket.id || '');
    if (!ticketId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'No ticket ID' }) };

    // Novo chamado → criar work item
    if (['add', 'new', 'create'].includes(glpiEvent)) {
      const azureItem = await createAzureWorkItem(config, {
        id: ticketId,
        name: glpiTicket.name || glpiTicket.title || `Chamado #${ticketId}`,
        content: glpiTicket.content || glpiTicket.description || '',
        priority: glpiTicket.priority || 3,
        requester: glpiTicket.requester || glpiTicket.users_id_recipient || '',
        category: glpiTicket.category || '',
      });

      await db.add('ticket_mappings', { glpiId: ticketId, azureId: String(azureItem.id) });
      await logSync('glpi_to_azure', 'success', {
        action: 'created', glpiId: ticketId, azureId: String(azureItem.id),
        azureUrl: azureItem._links?.html?.href,
      });
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: 'Work item criado', glpiId: ticketId, azureId: azureItem.id }) };
    }

    // Comentário/acompanhamento → adicionar comentário no Azure
    if (['update', 'add_followup', 'followup'].includes(glpiEvent)) {
      const mappings = await db.query('ticket_mappings', 'glpiId', '==', ticketId);
      if (!mappings.length) {
        return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: `GLPI #${ticketId} sem mapeamento` }) };
      }
      const mapping = mappings[0].data();
      const author = glpiTicket.author || glpiTicket.users_id || 'GLPI';
      const commentText = glpiTicket.content || glpiTicket.answer || payload.content || 'Atualização via GLPI';
      await addAzureComment(config, mapping.azureId, `<b>[GLPI] ${author}:</b><br/>${commentText}`);
      await logSync('glpi_to_azure', 'success', { action: 'comment_added', glpiId: ticketId, azureId: mapping.azureId });
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: 'Comentário adicionado no Azure' }) };
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: `Evento '${glpiEvent}' ignorado` }) };

  } catch (e) {
    console.error('glpi-webhook error:', e);
    await logSync('glpi_to_azure', 'error', { error: e.message });
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
  }
};
