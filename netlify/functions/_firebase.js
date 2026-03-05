// netlify/functions/_firebase.js
// Helper compartilhado — usa Firestore REST API diretamente (sem SDK, sem WebSocket)
// Resolve o erro "client is offline" que ocorre quando o SDK client-side roda em Node.js

// Faz requisições à Firestore REST API usando apenas projectId + apiKey
// Não requer firebase-admin, service account ou qualquer SDK
async function firestoreRequest(method, path, body) {
  const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
  const apiKey = process.env.REACT_APP_FIREBASE_API_KEY;

  if (!projectId) throw new Error('REACT_APP_FIREBASE_PROJECT_ID não configurado');

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const url = `${baseUrl}${path}${apiKey ? `?key=${apiKey}` : ''}`;

  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Firestore REST error ${res.status}: ${text.substring(0, 300)}`);
  }

  return text ? JSON.parse(text) : null;
}

// Converte valor JS para formato Firestore REST
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) fields[k] = toFirestoreValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// Converte objeto JS para documento Firestore
function toFirestoreDoc(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

// Converte valor Firestore para JS
function fromFirestoreValue(val) {
  if (val.nullValue !== undefined) return null;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue);
  if (val.doubleValue !== undefined) return val.doubleValue;
  if (val.stringValue !== undefined) return val.stringValue;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.arrayValue) return (val.arrayValue.values || []).map(fromFirestoreValue);
  if (val.mapValue) return fromFirestoreDoc(val.mapValue);
  return null;
}

// Converte documento Firestore para objeto JS
function fromFirestoreDoc(doc) {
  if (!doc || !doc.fields) return {};
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    obj[k] = fromFirestoreValue(v);
  }
  return obj;
}

// Extrai ID do documento do name completo
function extractId(name) {
  if (!name) return null;
  return name.split('/').pop();
}

// ─── API pública ───────────────────────────────────────────────────────────────

const db = {
  // GET /collection/docId
  async get(collection, docId) {
    try {
      const doc = await firestoreRequest('GET', `/${collection}/${docId}`);
      return { exists: true, id: docId, data: () => fromFirestoreDoc(doc) };
    } catch (e) {
      if (e.message.includes('404') || e.message.includes('NOT_FOUND')) {
        return { exists: false, id: docId, data: () => null };
      }
      throw e;
    }
  },

  // SET /collection/docId (cria ou sobrescreve)
  async set(collection, docId, data) {
    const doc = toFirestoreDoc(data);
    await firestoreRequest('PATCH', `/${collection}/${docId}`, doc);
  },

  // ADD /collection (gera ID automático)
  async add(collection, data) {
    data.createdAt = new Date().toISOString();
    const doc = toFirestoreDoc(data);
    const result = await firestoreRequest('POST', `/${collection}`, doc);
    return { id: extractId(result?.name) };
  },

  // DELETE /collection/docId
  async delete(collection, docId) {
    await firestoreRequest('DELETE', `/${collection}/${docId}`);
  },

  // QUERY com filtro simples de igualdade
  async query(collection, field, op, value) {
    const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
    const apiKey = process.env.REACT_APP_FIREBASE_API_KEY;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery${apiKey ? `?key=${apiKey}` : ''}`;

    const body = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: op === '==' ? 'EQUAL' : op,
            value: toFirestoreValue(value),
          },
        },
        limit: 10,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Query error ${res.status}: ${text.substring(0, 300)}`);

    const results = JSON.parse(text);
    return results
      .filter(r => r.document)
      .map(r => ({
        id: extractId(r.document.name),
        data: () => fromFirestoreDoc(r.document),
      }));
  },

  // LIST com ordenação e limite
  async list(collection, orderByField = 'createdAt', limitN = 100) {
    const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
    const apiKey = process.env.REACT_APP_FIREBASE_API_KEY;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery${apiKey ? `?key=${apiKey}` : ''}`;

    const body = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        orderBy: [{ field: { fieldPath: orderByField }, direction: 'DESCENDING' }],
        limit: limitN,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`List error ${res.status}: ${text.substring(0, 300)}`);

    const results = JSON.parse(text);
    return results
      .filter(r => r.document)
      .map(r => ({
        id: extractId(r.document.name),
        data: () => fromFirestoreDoc(r.document),
      }));
  },
};

module.exports = { db };
