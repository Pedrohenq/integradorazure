// netlify/functions/test-connection.js
const { db } = require('./_firebase');

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { target } = JSON.parse(event.body);

    const snap = await db.get('config', 'integration');
    if (!snap.exists) {
      return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Configure a integração primeiro' }) };
    }

    const config = snap.data();
    const results = {};

    // Testar GLPI
    if (target === 'glpi' || target === 'all') {
      try {
        const { glpiUrl, glpiAppToken, glpiUserToken, glpiLogin, glpiPassword } = config;
        const authHeaders = { 'App-Token': glpiAppToken };
        if (glpiUserToken) {
          authHeaders['Authorization'] = `user_token ${glpiUserToken}`;
        } else {
          authHeaders['Authorization'] = `Basic ${Buffer.from(`${glpiLogin}:${glpiPassword}`).toString('base64')}`;
        }
        const res = await fetch(`${glpiUrl}/apirest.php/initSession`, { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          await fetch(`${glpiUrl}/apirest.php/killSession`, {
            headers: { 'App-Token': glpiAppToken, 'Session-Token': data.session_token },
          });
          results.glpi = { success: true, message: 'Conexão com GLPI bem-sucedida!' };
        } else {
          const err = await res.text();
          results.glpi = { success: false, message: `Falha GLPI (${res.status}): ${err.substring(0, 150)}` };
        }
      } catch (e) {
        results.glpi = { success: false, message: `Erro GLPI: ${e.message}` };
      }
    }

    // Testar Azure
    if (target === 'azure' || target === 'all') {
      try {
        const { azureOrg, azureProject, azurePat } = config;
        const token = Buffer.from(`:${azurePat}`).toString('base64');
        const res = await fetch(
          `https://dev.azure.com/${azureOrg}/${azureProject}/_apis/wit/workitemtypes?api-version=7.1`,
          { headers: { Authorization: `Basic ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          results.azure = { success: true, message: `Azure DevOps conectado! ${data.count || 0} tipos encontrados.` };
        } else {
          const err = await res.text();
          results.azure = { success: false, message: `Falha Azure (${res.status}): ${err.substring(0, 150)}` };
        }
      } catch (e) {
        results.azure = { success: false, message: `Erro Azure: ${e.message}` };
      }
    }

    return { statusCode: 200, headers: HEADERS, body: JSON.stringify(results) };
  } catch (e) {
    console.error('test-connection error:', e);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
  }
};
