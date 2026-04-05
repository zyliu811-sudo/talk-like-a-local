const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'sentences.json');
const TEMP_FILE = DATA_FILE + '.tmp';

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ sentences: [] }, null, 2), 'utf8');
  }
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(TEMP_FILE, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(TEMP_FILE, DATA_FILE);
}

// Today's date in UTC+8 (China Standard Time), format YYYY-MM-DD
function todayCST() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── SM-2 Algorithm ────────────────────────────────────────────────────────────

function applyReview(sr, result) {
  const today = todayCST();
  const knew = result === 'knew';

  if (!knew) {
    sr.repetitions = 0;
    sr.lapses += 1;
    sr.interval = 1;
    sr.easeFactor = Math.max(1.3, sr.easeFactor - 0.2);
    sr.dueDate = addDays(today, 1);
  } else {
    if (sr.repetitions === 0) {
      sr.interval = 1;
    } else if (sr.repetitions === 1) {
      sr.interval = 6;
    } else {
      sr.interval = Math.round(sr.interval * sr.easeFactor);
    }
    sr.easeFactor = Math.min(2.5, sr.easeFactor + 0.1);
    sr.repetitions += 1;
    sr.dueDate = addDays(today, sr.interval);
  }
  return sr;
}

// ── Middleware ────────────────────────────────────────────────────────────────

// ── Basic auth (set APP_PASSWORD env var to enable) ──────────────────────────

const APP_PASSWORD = process.env.APP_PASSWORD || '';
if (APP_PASSWORD) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Basic ')) {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString();
      const password = decoded.slice(decoded.indexOf(':') + 1);
      if (password === APP_PASSWORD) return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Talk Like a Local"');
    res.status(401).send('Password required');
  });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────────────────────

// GET /api/sentences — all sentences, newest first
app.get('/api/sentences', (req, res) => {
  const data = readData();
  const sorted = data.sentences.slice().sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
  res.json(sorted);
});

// GET /api/sentences/due — sentences due today
app.get('/api/sentences/due', (req, res) => {
  const today = todayCST();
  const data = readData();
  const due = data.sentences.filter(s => s.sr.dueDate <= today);
  res.json(due);
});

function normalizeSource(source) {
  if (!source) return { url: '', timestamp: '' };
  if (typeof source === 'string') return { url: source, timestamp: '' };
  return { url: (source.url || '').trim(), timestamp: (source.timestamp || '').trim() };
}

// POST /api/sentences — add new sentence
app.post('/api/sentences', (req, res) => {
  const { english, chinese, source, keywords } = req.body;
  if (!english || !chinese) {
    return res.status(400).json({ error: '英文和中文均为必填项' });
  }
  const today = todayCST();
  const sentence = {
    id: crypto.randomUUID(),
    english: english.trim(),
    chinese: chinese.trim(),
    source: normalizeSource(source),
    keywords: Array.isArray(keywords) ? keywords : [],
    createdAt: new Date().toISOString(),
    sr: {
      interval: 1,
      easeFactor: 2.5,
      dueDate: today,
      repetitions: 0,
      lapses: 0
    }
  };
  const data = readData();
  data.sentences.push(sentence);
  writeData(data);
  res.status(201).json(sentence);
});

// PUT /api/sentences/:id/review — update SR after review
app.put('/api/sentences/:id/review', (req, res) => {
  const { result } = req.body;
  if (result !== 'knew' && result !== 'forgot') {
    return res.status(400).json({ error: 'result 必须是 "knew" 或 "forgot"' });
  }
  const data = readData();
  const sentence = data.sentences.find(s => s.id === req.params.id);
  if (!sentence) return res.status(404).json({ error: '句子不存在' });

  sentence.sr = applyReview(sentence.sr, result);
  writeData(data);
  res.json(sentence);
});

// PUT /api/sentences/:id — update sentence fields
app.put('/api/sentences/:id', (req, res) => {
  const { english, chinese, source, keywords } = req.body;
  if (!english || !chinese) {
    return res.status(400).json({ error: '英文和中文均为必填项' });
  }
  const data = readData();
  const sentence = data.sentences.find(s => s.id === req.params.id);
  if (!sentence) return res.status(404).json({ error: '句子不存在' });

  sentence.english  = english.trim();
  sentence.chinese  = chinese.trim();
  sentence.source   = normalizeSource(source);
  sentence.keywords = Array.isArray(keywords) ? keywords : [];
  writeData(data);
  res.json(sentence);
});

// DELETE /api/sentences/:id
app.delete('/api/sentences/:id', (req, res) => {
  const data = readData();
  const idx = data.sentences.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '句子不存在' });
  data.sentences.splice(idx, 1);
  writeData(data);
  res.json({ ok: true });
});

// GET /api/export/json
app.get('/api/export/json', (req, res) => {
  const today = todayCST();
  res.setHeader('Content-Disposition', `attachment; filename="sentences-${today}.json"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.sendFile(DATA_FILE);
});

// GET /api/export/csv
app.get('/api/export/csv', (req, res) => {
  const today = todayCST();
  const data = readData();
  const headers = ['id', 'english', 'chinese', 'source', 'createdAt', 'interval', 'easeFactor', 'dueDate', 'repetitions', 'lapses'];

  function escapeCSV(val) {
    const s = String(val == null ? '' : val);
    if (s.includes('"') || s.includes(',') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const rows = data.sentences.map(s => [
    s.id, s.english, s.chinese, s.source, s.createdAt,
    s.sr.interval, s.sr.easeFactor, s.sr.dueDate, s.sr.repetitions, s.sr.lapses
  ].map(escapeCSV).join(','));

  // UTF-8 BOM for Excel on Windows
  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');

  res.setHeader('Content-Disposition', `attachment; filename="sentences-${today}.csv"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send(csv);
});

// ── Start ─────────────────────────────────────────────────────────────────────

ensureDataFile();

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`服务已启动 → http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n端口 ${PORT} 已被占用，请关闭占用该端口的程序后重试。\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
