// netlify/functions/debug.js
// Use para verificar se o deploy foi aplicado corretamente
// Acesse: https://sua-app.netlify.app/api/debug

exports.handler = async () => {
  const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
  const apiKey = process.env.REACT_APP_FIREBASE_API_KEY;

  // Testa a Firestore REST API diretamente
  let firestoreStatus = 'não testado';
  let firestoreError = null;

  if (projectId && apiKey) {
    try {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/integration?key=${apiKey}`;
      const res = await fetch(url);
      if (res.status === 200 || res.status === 404) {
        firestoreStatus = res.status === 200 ? 'conectado - documento encontrado' : 'conectado - documento não existe ainda (normal)';
      } else {
        const text = await res.text();
        firestoreStatus = `erro ${res.status}`;
        firestoreError = text.substring(0, 200);
      }
    } catch (e) {
      firestoreStatus = 'erro de rede';
      firestoreError = e.message;
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      deploy_version: 'v2-rest-api',  // Se aparecer v2-rest-api, deploy foi aplicado!
      timestamp: new Date().toISOString(),
      env_vars: {
        REACT_APP_FIREBASE_PROJECT_ID: projectId ? `${projectId.substring(0, 5)}...` : 'NÃO CONFIGURADO ❌',
        REACT_APP_FIREBASE_API_KEY: apiKey ? `${apiKey.substring(0, 5)}...` : 'NÃO CONFIGURADO ❌',
      },
      firestore_rest_api: firestoreStatus,
      firestore_error: firestoreError,
      sdk_used: 'Firestore REST API (sem firebase-admin, sem firebase SDK)',
    }, null, 2),
  };
};
