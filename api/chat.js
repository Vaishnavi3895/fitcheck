export const config = {
  api: { bodyParser: true },
};

const ALLOWED_ORIGINS = [
  'https://fitcheck-liart-chi.vercel.app',
  'https://fitcheck.vercel.app',
];

function isAllowed(req) {
  const origin = req.headers.origin || req.headers.referer || '';
  // Allow our known domains
  if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) return true;
  // Allow all Vercel preview deployments for this project
  if (origin.includes('fitcheck') && origin.includes('vercel.app')) return true;
  // Allow if no origin (direct server-to-server, Vercel internal)
  if (!origin) return true;
  return false;
}

const rateLimitMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) { rateLimitMap.set(ip, { count: 1, start: now }); return true; }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++; rateLimitMap.set(ip, entry); return true;
}

function sanitiseInput(text) {
  if (!text || typeof text !== 'string') return '';
  const patterns = [
    /ignore\s+(all\s+)?(previous|prior|above|the)\s+(instructions?|prompts?|context|rules?)/gi,
    /forget\s+(all\s+)?(previous|prior|above|the)\s+(instructions?|prompts?|context|rules?)/gi,
    /you\s+are\s+now\s+a?\s+\w+/gi,
    /act\s+as\s+(a|an)\s+\w+/gi,
    /pretend\s+(you\s+are|to\s+be)\s+/gi,
    /\[INST\]/gi, /<<SYS>>/gi,
  ];
  let s = text;
  for (const p of patterns) s = s.replace(p, '[removed]');
  return s.substring(0, 8000);
}

export default async function handler(req, res) {
  // Origin check
  if (!isAllowed(req) && process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { system, messages, max_tokens } = body;

    // Sanitise all messages
    const safeMessages = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? sanitiseInput(m.content) : m.content
    }));

    const groqMessages = system
      ? [{ role: 'system', content: sanitiseInput(system) }, ...safeMessages]
      : safeMessages;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: Math.min(max_tokens || 1000, 1500), // hard cap
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    // Convert to Anthropic format so frontend works unchanged
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content: [{ type: 'text', text }] });

  } catch (err) {
    return res.status(500).json({ error: 'Proxy error: ' + err.message });
  }
}
