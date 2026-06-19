import formidable from 'formidable';
import fs from 'fs';
import pdfParse from 'pdf-parse';

export const config = {
  api: {
    bodyParser: false, // Required for file uploads
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const form = formidable({ maxFileSize: 5 * 1024 * 1024 }); // 5MB limit

    const [, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const file = files.resume?.[0] || files.resume;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const buffer = fs.readFileSync(file.filepath || file.path);
    const data = await pdfParse(buffer);

    const text = data.text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!text || text.length < 50) {
      return res.status(400).json({ error: 'Could not extract text from PDF. Please try a different file or paste your resume as text.' });
    }

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to parse PDF: ' + err.message });
  }
}
