// netlify/functions/sync-glpi.js
exports.handler = async (event) => {
  const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  try {
    const { db } = require('./_firebase');

    // ── 1. Carrega config ──────────────────────────────────────────────────────
    const configSnap = await db.get('config', 'integration');
    if (!configSnap.exists) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Salve a configuração primeiro.' }) };
    }
    const config = configSnap.data();
    const glpiUrl = (config.glpiUrl || '').replace(/\/$/, '');

    // ── 2. Autenticar no GLPI (POST /initSession) ──────────────────────────────
    const authHeaders = {
      'Content-Type': 'application/json',
      'App-Token': config.glpiAppToken,
    };
    if (config.glpiUserToken) {
      authHeaders['Authorization'] = `user_token ${config.glpiUserToken}`;
    } else {
      authHeaders['Authorization'] = `Basic ${Buffer.from(`${config.glpiLogin}:${config.glpiPassword}`).toString('base64')}`;
    }

    const sessionRes = await fetch(`${glpiUrl}/apirest.php/initSession`, {
      method: 'POST', // ← POST conforme documentação
      headers: authHeaders,
    });

    if (!sessionRes.ok) {
      const txt = await sessionRes.text().catch(() => '');
      return { statusCode: 502, headers: HEADERS, body: JSON.stringify({ error: `GLPI auth falhou (${sessionRes.status}): ${txt.substring(0, 300)}` }) };
    }

    const sessionData = await sessionRes.json();
    const sessionToken = sessionData.session_token;
    if (!sessionToken) {
      return { statusCode: 502, headers: HEADERS, body: JSON.stringify({ error: 'GLPI não retornou session_token', response: sessionData }) };
    }

    // Helper para encerrar sessão
    const killSession = () => fetch(`${glpiUrl}/apirest.php/killSession`, {
      method: 'GET',
      headers: { 'App-Token': config.glpiAppToken, 'Session-Token': sessionToken },
    }).catch(() => {});

    // ── 3. Buscar tickets (GET /Ticket) ────────────────────────────────────────
    // Busca os 50 tickets mais recentes, status: Novo(1), Em atendimento(2), Planejado(3), Pendente(4)
    const ticketsUrl = `${glpiUrl}/apirest.php/Ticket?` +
      `expand_dropdowns=true&get_hateoas=false&range=0-49` +
      `&criteria[0][field]=12&criteria[0][searchtype]=lessthan&criteria[0][value]=5`; // status < 5 (não solucionado/fechado)

    const ticketsRes = await fetch(ticketsUrl, {
      method: 'GET',
      headers: {
        'App-Token': config.glpiAppToken,
        'Session-Token': sessionToken,
      },
    });

    let tickets = [];
    if (ticketsRes.status === 200 || ticketsRes.status === 206) {
      const raw = await ticketsRes.json();
      tickets = Array.isArray(raw) ? raw : [];
    } else if (ticketsRes.status === 404) {
      tickets = []; // Sem tickets ativos
    } else {
      const txt = await ticketsRes.text().catch(() => '');
      await killSession();
      return { statusCode: 502, headers: HEADERS, body: JSON.stringify({ error: `GLPI tickets falhou (${ticketsRes.status}): ${txt.substring(0, 300)}` }) };
    }

    // ── 4. Processar cada ticket ───────────────────────────────────────────────
    const azureToken = Buffer.from(`:${config.azurePat}`).toString('base64');
    const created = [];
    const skipped = [];
    const errors = [];

    for (const ticket of tickets) {
      try {
        const glpiId = String(ticket.id);

        // Verifica se já existe mapeamento
        const existing = await db.query('ticket_mappings', 'glpiId', '==', glpiId);
        if (existing.length > 0) {
          skipped.push(glpiId);

          // ── 4a. Sincroniza followups GLPI → Azure ───────────────────────────
          const azureId = existing[0].data().azureId;

          // Busca followups do ticket
          const fuRes = await fetch(`${glpiUrl}/apirest.php/Ticket/${ticket.id}/ITILFollowup?range=0-99`, {
            method: 'GET',
            headers: { 'App-Token': config.glpiAppToken, 'Session-Token': sessionToken },
          });

          if (fuRes.status === 200 || fuRes.status === 206) {
            const followups = await fuRes.json().catch(() => []);

            // Carrega followups já sincronizados
            const syncedSnap = await db.get('synced_followups', glpiId);
            const synced = syncedSnap.exists ? (syncedSnap.data().ids || []) : [];
            const newSynced = [...synced];
            let addedFollowups = 0;

            for (const fu of (Array.isArray(followups) ? followups : [])) {
              if (synced.includes(fu.id)) continue;
              // Ignora followups que vieram do próprio Azure (evita loop)
              if ((fu.content || '').includes('[Azure DevOps')) {
                newSynced.push(fu.id);
                continue;
              }

              // Adiciona como comentário no Azure
              await fetch(
                `https://dev.azure.com/${config.azureOrg}/${config.azureProject}/_apis/wit/workitems/${azureId}/comments?api-version=7.1-preview.3`,
                {
                  method: 'POST',
                  headers: { 'Authorization': `Basic ${azureToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: `<b>[GLPI Followup]</b><br/>${fu.content || ''}` }),
                }
              );
              newSynced.push(fu.id);
              addedFollowups++;
            }

            if (newSynced.length !== synced.length) {
              await db.set('synced_followups', glpiId, { ids: newSynced.slice(-200) });
            }
          }

          continue; // Próximo ticket
        }

        // ── 4b. Cria novo Work Item no Azure ────────────────────────────────
        const type = encodeURIComponent(config.azureWorkItemType || 'Task');
        const statusMap = { 1: 'Novo', 2: 'Em Atendimento', 3: 'Planejado', 4: 'Pendente', 5: 'Solucionado', 6: 'Fechado' };
        const priorityMap = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };

        const patchBody = [
          { op: 'add', path: '/fields/System.Title', value: `[GLPI #${ticket.id}] ${ticket.name || 'Sem título'}` },
          {
            op: 'add', path: '/fields/System.Description',
            value: [
              `<b>Chamado GLPI #${ticket.id}</b>`,
              `<b>Status:</b> ${statusMap[ticket.status] || ticket.status}`,
              `<b>Prioridade:</b> ${ticket.priority || ''}`,
              `<b>Solicitante:</b> ${ticket['users_id_recipient'] || ticket['_users_id_requester'] || ''}`,
              `<b>Categoria:</b> ${ticket['itilcategories_id'] || ''}`,
              `<hr/>`,
              ticket.content || '',
            ].join('<br/>'),
          },
          { op: 'add', path: '/fields/Microsoft.VSTS.Common.Priority', value: priorityMap[ticket.priority] || 3 },
          { op: 'add', path: '/fields/System.Tags', value: `GLPI;glpi-id-${ticket.id}` },
        ];

        if (config.azureAreaPath) patchBody.push({ op: 'add', path: '/fields/System.AreaPath', value: config.azureAreaPath });
        if (config.azureIterationPath) patchBody.push({ op: 'add', path: '/fields/System.IterationPath', value: config.azureIterationPath });

        const azureRes = await fetch(
          `https://dev.azure.com/${config.azureOrg}/${config.azureProject}/_apis/wit/workitems/$${type}?api-version=7.1`,
          {
            method: 'POST',
            headers: { 'Authorization': `Basic ${azureToken}`, 'Content-Type': 'application/json-patch+json' },
            body: JSON.stringify(patchBody),
          }
        );

        if (!azureRes.ok) {
          const txt = await azureRes.text().catch(() => '');
          errors.push({ glpiId, error: `Azure (${azureRes.status}): ${txt.substring(0, 150)}` });
          continue;
        }

        const azureItem = await azureRes.json();
        const azureId = String(azureItem.id);

        await db.add('ticket_mappings', { glpiId, azureId });
        await db.add('sync_logs', {
          type: 'glpi_to_azure',
          status: 'success',
          details: { action: 'created', glpiId, azureId, ticketName: ticket.name },
        });

        created.push({ glpiId, azureId, ticketName: ticket.name });

      } catch (ticketErr) {
        errors.push({ glpiId: String(ticket.id), error: ticketErr.message });
      }
    }

    // ── 5. Encerra sessão GLPI ─────────────────────────────────────────────────
    await killSession();

    // ── 6. Salva log da sincronização ──────────────────────────────────────────
    await db.add('sync_logs', {
      type: 'polling_sync',
      status: errors.length > 0 && created.length === 0 ? 'error' : 'success',
      details: {
        ticketsFound: tickets.length,
        created: created.length,
        skipped: skipped.length,
        errors,
        triggeredBy: event.httpMethod === 'POST' ? 'manual' : 'scheduled',
      },
    }).catch(() => {});

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        ok: true,
        ticketsFound: tickets.length,
        created: created.length,
        skipped: skipped.length,
        errors,
        createdItems: created,
      }),
    };

  } catch (err) {
    console.error('[sync-glpi] ERRO CRÍTICO:', err.message);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
