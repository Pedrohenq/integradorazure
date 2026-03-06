// netlify/functions/save-config.js
const { db } = require('./_firebase');

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const snap = await db.get('config', 'integration');
      if (!snap.exists) return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ config: null }) };

      const data = snap.data();
      const masked = {
        ...data,
        glpiPassword:  data.glpiPassword  ? '••••••••' : '',
        azurePat:      data.azurePat      ? data.azurePat.substring(0, 4) + '••••••••' : '',
        glpiUserToken: data.glpiUserToken ? data.glpiUserToken.substring(0, 4) + '••••••••' : '',
      };
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ config: masked }) };
    } catch (e) {
      console.error('GET config error:', e);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);

      const existing = await db.get('config', 'integration');
      const prev = existing.exists ? existing.data() : {};

      const config = {
        glpiUrl:            (body.glpiUrl || prev.glpiUrl || '').replace(/\/$/, ''),
        glpiAppToken:       body.glpiAppToken       || prev.glpiAppToken       || '',
        glpiUserToken:      body.glpiUserToken?.includes('••')  ? prev.glpiUserToken  : (body.glpiUserToken  || prev.glpiUserToken  || ''),
        glpiLogin:          body.glpiLogin          || prev.glpiLogin          || '',
        glpiPassword:       body.glpiPassword?.includes('••')   ? prev.glpiPassword   : (body.glpiPassword   || prev.glpiPassword   || ''),
        azureOrg:           body.azureOrg           || prev.azureOrg           || '',
        azureProject:       body.azureProject       || prev.azureProject       || '',
        azurePat:           body.azurePat?.includes('••')       ? prev.azurePat       : (body.azurePat       || prev.azurePat       || ''),
        azureWorkItemType:  body.azureWorkItemType  || prev.azureWorkItemType  || 'Task',
        azureAreaPath:      body.azureAreaPath      || prev.azureAreaPath      || '',
        azureIterationPath: body.azureIterationPath || prev.azureIterationPath || '',
        webhookSecret:      body.webhookSecret      || prev.webhookSecret      || '',
        updatedAt: new Date().toISOString(),
      };

      await db.set('config', 'integration', config);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: 'Configuração salva com sucesso!' }) };
    } catch (e) {
      console.error('POST config error:', e);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
