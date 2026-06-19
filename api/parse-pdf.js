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

    // Extract text from PDF by parsing raw content streams
    const content = buffer.toString('latin1');
    
    // Extract text between BT (Begin Text) and ET (End Text) markers
    const textChunks = [];
    const btEtRegex = /BT[\s\S]*?ET/g;
    const matches = content.match(btEtRegex) || [];
    
    for (const block of matches) {
      // Match Tj and TJ operators which contain actual text
      const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g) || [];
      const tjArrayMatches = block.match(/\[([^\]]*)\]\s*TJ/g) || [];
      
      for (const m of tjMatches) {
        const text = m.match(/\(([^)]*)\)/)?.[1] || '';
        if (text.trim()) textChunks.push(text);
      }
      for (const m of tjArrayMatches) {
        const parts = m.match(/\(([^)]*)\)/g) || [];
        for (const p of parts) {
          const text = p.slice(1, -1);
          if (text.trim()) textChunks.push(text);
        }
      }
    }

    let text = textChunks.join(' ')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/ {3,}/g, '  ')
      .trim();

    // If raw extraction didn't work well, try a broader approach
    if (text.length < 100) {
      const streamRegex = /stream([\s\S]*?)endstream/g;
      const streams = [];
      let match;
      while ((match = streamRegex.exec(content)) !== null) {
        const s = match[1].replace(/[^\x20-\x7E\n]/g, ' ').trim();
        if (s.length > 50) streams.push(s);
      }
      text = streams.join('\n').replace(/ {3,}/g, '  ').trim();
    }

    if (!text || text.length < 50) {
      return res.status(400).json({ 
        error: 'Could not extract text from this PDF. It may be scanned or image-based. Please paste your resume as text instead.' 
      });
    }

    return res.status(200).json({ text: text.substring(0, 15000) });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to parse PDF: ' + err.message });
  }
}
