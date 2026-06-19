export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) return res.status(400).json({ error: 'No PDF data received' });

    const buffer = Buffer.from(pdfBase64, 'base64');
    const text = extractTextFromPDF(buffer);

    if (!text || text.length < 50) {
      return res.status(400).json({
        error: 'Could not extract text from this PDF. It may be a scanned image. Please paste your resume as text instead.'
      });
    }

    return res.status(200).json({ text: text.substring(0, 15000) });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to parse PDF: ' + err.message });
  }
}

function extractTextFromPDF(buffer) {
  const content = buffer.toString('binary');
  const results = [];

  // Method 1: Extract from BT/ET text blocks
  const btBlocks = content.match(/BT[\s\S]*?ET/g) || [];
  for (const block of btBlocks) {
    // Tj operator: (text) Tj
    const tjMatches = block.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g) || [];
    for (const m of tjMatches) {
      const inner = m.match(/\(([\s\S]*)\)\s*Tj$/);
      if (inner) results.push(decodePDFString(inner[1]));
    }
    // TJ operator: [(text) -num (text)] TJ
    const tjArrays = block.match(/\[[\s\S]*?\]\s*TJ/g) || [];
    for (const arr of tjArrays) {
      const parts = arr.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g) || [];
      for (const p of parts) {
        results.push(decodePDFString(p.slice(1, -1)));
      }
    }
  }

  let text = results.join(' ').trim();

  // Method 2: Fallback — look for readable ASCII runs if method 1 yields little
  if (text.length < 100) {
    const readable = content
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s{3,}/g, '\n')
      .trim();
    // Only use runs of 4+ word characters
    const words = readable.match(/[a-zA-Z]{2,}[\s\S]{0,200}/g) || [];
    text = words.join(' ').substring(0, 15000);
  }

  return text
    .replace(/\s+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // fix merged words like "ExperienceEducation"
    .trim();
}

function decodePDFString(s) {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}
