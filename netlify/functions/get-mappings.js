// netlify/functions/get-mappings.js
const { db } = require('./_firebase');

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };

  if (event.httpMethod === 'GET') {
    try {
      const docs = await db.list('ticket_mappings', 'createdAt', 200);
      const mappings = docs.map(d => ({ id: d.id, ...d.data() }));
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ mappings }) };
    } catch (e) {
      console.error('get-mappings error:', e);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
    }
  }

  if (event.httpMethod === 'DELETE') {
    try {
      const { id } = JSON.parse(event.body);
      await db.delete('ticket_mappings', id);
      return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ message: 'Mapeamento removido' }) };
    } catch (e) {
      console.error('delete-mapping error:', e);
      return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
};
