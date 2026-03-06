// netlify/functions/get-logs.js
const { db } = require('./_firebase');

const HEADERS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: HEADERS, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const docs = await db.list('sync_logs', 'createdAt', 100);
    const logs = docs.map(d => ({ id: d.id, ...d.data() }));
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ logs }) };
  } catch (e) {
    console.error('get-logs error:', e);
    return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: e.message }) };
  }
};
