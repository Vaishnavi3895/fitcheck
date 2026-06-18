export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return res.status(500).json({ error: 'Supabase not configured' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { action, payload, token } = body;

    const headers = {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
    };

    let url, method = 'POST', fetchBody;

    if (action === 'signup') {
      url = `${SUPABASE_URL}/auth/v1/signup`;
      fetchBody = JSON.stringify({ email: payload.email, password: payload.password });
    } else if (action === 'signin') {
      url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
      fetchBody = JSON.stringify({ email: payload.email, password: payload.password });
    } else if (action === 'signout') {
      url = `${SUPABASE_URL}/auth/v1/logout`;
      fetchBody = JSON.stringify({});
    } else if (action === 'get_user') {
      url = `${SUPABASE_URL}/auth/v1/user`;
      method = 'GET';
    } else if (action === 'save_job') {
      url = `${SUPABASE_URL}/rest/v1/jobs`;
      fetchBody = JSON.stringify({ user_id: payload.user_id, title: payload.title, company: payload.company, status: payload.status, notes: payload.notes });
    } else if (action === 'get_jobs') {
      url = `${SUPABASE_URL}/rest/v1/jobs?user_id=eq.${payload.user_id}&order=created_at.desc`;
      method = 'GET';
      headers['Prefer'] = 'return=representation';
    } else if (action === 'update_job') {
      url = `${SUPABASE_URL}/rest/v1/jobs?id=eq.${payload.id}`;
      method = 'PATCH';
      fetchBody = JSON.stringify({ status: payload.status });
      headers['Prefer'] = 'return=representation';
    } else if (action === 'delete_job') {
      url = `${SUPABASE_URL}/rest/v1/jobs?id=eq.${payload.id}`;
      method = 'DELETE';
    } else if (action === 'save_run') {
      url = `${SUPABASE_URL}/rest/v1/runs`;
      fetchBody = JSON.stringify({ user_id: payload.user_id, role: payload.role, score: payload.score, verdict: payload.verdict });
    } else if (action === 'get_runs') {
      url = `${SUPABASE_URL}/rest/v1/runs?user_id=eq.${payload.user_id}&order=created_at.desc`;
      method = 'GET';
    } else if (action === 'delete_run') {
      url = `${SUPABASE_URL}/rest/v1/runs?id=eq.${payload.id}`;
      method = 'DELETE';
    } else if (action === 'update_profile') {
      url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${payload.user_id}`;
      method = 'PATCH';
      fetchBody = JSON.stringify({ linkedin_url: payload.linkedin_url });
      headers['Prefer'] = 'return=representation';
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }

    const response = await fetch(url, { method, headers, body: fetchBody });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    return res.status(response.status).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
