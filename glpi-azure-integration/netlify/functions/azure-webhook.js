// netlify/functions/azure-webhook.js
// Recebe webhooks do Azure DevOps e adiciona comentários no GLPI
const { db } = require('./_firebase');

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

async function logSync(type, status, details) {
  try { await db.add('sync_logs', { type, status, details }); }
  catch (e) { console.error('log error:', e.message); }
}

async function getGlpiSession(config) {
  const { glpiUrl, glpiAppToken, glpiUserToken, glpiLogin, glpiPassword } = config;
  const headers = { 'App-Token': glpiAppToken };
  if (glpiUserToken) {
    headers['Authorization'] = `user_token ${glpiUserToken}`;
  } else {
    headers['Authorization'] = `Basic ${Buffer.from(`${glpiLogin}:${glpiPassword}`).toString('base64')}`;
  }
  const res = await fetch(`${glpiUrl}/apirest.php/initSession`, { headers });
  if (!res.ok) throw new Error(`GLPI auth ${res.status}: ${(await res.text()).substring(0, 150)}`);
  const data = await res.json();
  return data.session_token;
}

async function addGlpiComment(config, ticketId, text) {
  const sessionToken = await getGlpiSession(config);
  const { glpiUrl, glpiAppToken } = config;

  const res = await fetch(`${glpiUrl}/apirest.php/Ticket/${ticketId}/ITILFollowup`, {
    method: 'POST',
    headers: { 'App-Token': glpiAppToken, 'Session-Token': sessionToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { items_id: parseInt(ticketId), itemtype: 'Ticket', content: text, is_private: 0 } }),
  });

  // Sempre mata a sessão
  await fetch(`${glpiUrl}/apirest.php/killSession`, {
    headers: { 'App-Token': glpiAppToken, 'Session-Token': sessionToken },
  }).catch(() => {});

  if (!res.ok) throw new Error(`GLPI followup ${res.status}: ${(await res.text()).substring(0, 150)}`);
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const snap = await db.get('config', 'integration');
    if (!snap.exists) return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: 'Configuração não encontrada' }) };
    const config = snap.data();

    let payload;
    try { payload = JSON.parse(event.body); }
    catch { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const eventType = payload.eventType || '';
    const resource = payload.resource || {};

    // Comentário adicionado no Azure
    if (eventType === 'workitem.commented' || eventType.includes('commented')) {
      const workItemId = String(resource.workItemId || resource.id || resource.fields?.['System.Id'] || '');
      const commentText = resource.text || resource.comment || '';
      const author = resource.revisedBy?.displayName || resource.changedBy || 'Azure DevOps';

      if (!workItemId) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'No work item ID' }) };

      const mappings = await db.query('ticket_mappings', 'azureId', '==', workItemId);
      if (!mappings.length) return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: `Work item ${workItemId} não mapeado` }) };

      const { glpiId } = mappings[0].data();
      await addGlpiComment(config, glpiId, `[Azure DevOps - ${author}]:\n${commentText}`);
      await logSync('azure_to_glpi', 'success', { action: 'comment_added', azureId: workItemId, glpiId, author });
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: 'Comentário adicionado no GLPI', glpiId }) };
    }

    // Work item atualizado (mudança de status)
    if (eventType === 'workitem.updated' || eventType.includes('updated')) {
      const workItemId = String(resource.workItemId || resource.id || '');
      const fields = resource.fields || resource.revisedFields || {};
      const stateChange = fields['System.State'];
      if (!stateChange) return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: 'Sem mudança de estado relevante' }) };

      const mappings = await db.query('ticket_mappings', 'azureId', '==', workItemId);
      if (!mappings.length) return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: `Work item ${workItemId} não mapeado` }) };

      const { glpiId } = mappings[0].data();
      const oldState = stateChange.oldValue || '?';
      const newState = stateChange.newValue || '?';
      const changedBy = resource.revisedBy?.displayName || 'Azure DevOps';

      await addGlpiComment(config, glpiId, `[Azure DevOps] Status atualizado por ${changedBy}: ${oldState} → ${newState}`);
      await logSync('azure_to_glpi', 'success', { action: 'status_change', azureId: workItemId, glpiId, oldState, newState });
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: 'Status sincronizado no GLPI', glpiId }) };
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: `Evento '${eventType}' não processado` }) };

  } catch (e) {
    console.error('azure-webhook error:', e);
    await logSync('azure_to_glpi', 'error', { error: e.message });
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
  }
};
