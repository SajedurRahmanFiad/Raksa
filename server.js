'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'raksa-db.json');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'RAKSA@2026';
const WEBHOOK_URL = process.env.NOTIFICATION_WEBHOOK_URL || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 8;

const sessions = new Map();
const rateBuckets = new Map();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

const defaultData = {
  inquiries: [],
  projects: [
    {
      id: crypto.randomUUID(),
      title: 'High-rise finishing support',
      location: 'Gulf Region',
      category: 'Construction',
      year: '2026',
      featured: true,
      status: 'active',
      image: '/assets/img/project-placeholder-1.svg',
      description: 'Finishing, manpower coordination, and site execution support for premium building works.',
      tags: ['finishing', 'manpower', 'quality']
    },
    {
      id: crypto.randomUUID(),
      title: 'MEP and trade workforce mobilization',
      location: 'Saudi Arabia',
      category: 'Manpower Supply',
      year: '2026',
      featured: true,
      status: 'active',
      image: '/assets/img/project-placeholder-2.svg',
      description: 'Skilled technical personnel for electrical, mechanical, civil, and support requirements.',
      tags: ['mep', 'technical', 'mobilization']
    },
    {
      id: crypto.randomUUID(),
      title: 'Contracting support package',
      location: 'Riyadh, Saudi Arabia',
      category: 'Contracting',
      year: '2026',
      featured: true,
      status: 'active',
      image: '/assets/img/project-placeholder-3.svg',
      description: 'A controlled delivery model combining site supervision, manpower planning, and trade execution.',
      tags: ['contracting', 'supervision', 'delivery']
    }
  ]
};

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    atomicWriteJson(DATA_FILE, defaultData);
  }
}

function readDb() {
  ensureDataFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    parsed.inquiries = Array.isArray(parsed.inquiries) ? parsed.inquiries : [];
    parsed.projects = Array.isArray(parsed.projects) ? parsed.projects : [];
    return parsed;
  } catch (error) {
    console.error('Failed to read database file:', error);
    return { inquiries: [], projects: [] };
  }
}

function writeDb(db) {
  atomicWriteJson(DATA_FILE, db);
}

function atomicWriteJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function setCommonHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
}

function send(res, status, body, headers = {}) {
  setCommonHeaders(res);
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  res.statusCode = status;
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload), { 'Content-Type': 'application/json; charset=utf-8' });
}

function notFound(res) {
  json(res, 404, { ok: false, error: 'Not found' });
}

function methodNotAllowed(res) {
  json(res, 405, { ok: false, error: 'Method not allowed' });
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map((part) => {
    const [key, ...value] = part.trim().split('=');
    return [decodeURIComponent(key || ''), decodeURIComponent(value.join('=') || '')];
  }).filter(([key]) => key));
}

function cookieString(name, value, maxAgeSeconds) {
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt < now) sessions.delete(token);
  }
}

function getSession(req) {
  cleanupSessions();
  const token = parseCookies(req).raksa_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return { token, ...session };
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session) {
    json(res, 401, { ok: false, error: 'Admin login required' });
    return null;
  }
  return session;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(req, keyPrefix, limit, windowMs) {
  const now = Date.now();
  const key = `${keyPrefix}:${getClientIp(req)}`;
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt < now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count > limit;
}

function readBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const type = (req.headers['content-type'] || '').split(';')[0].trim();
      try {
        if (!raw) return resolve({});
        if (type === 'application/json') return resolve(JSON.parse(raw));
        if (type === 'application/x-www-form-urlencoded') return resolve(Object.fromEntries(new URLSearchParams(raw)));
        return resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid request body'));
      }
    });
    req.on('error', reject);
  });
}

function cleanString(value, max = 500) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanTags(value) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item, 32)).filter(Boolean).slice(0, 8);
  return cleanString(value, 200).split(',').map((item) => cleanString(item, 32)).filter(Boolean).slice(0, 8);
}

function validateInquiry(input) {
  const inquiry = {
    name: cleanString(input.name, 120),
    company: cleanString(input.company, 140),
    phone: cleanString(input.phone, 60),
    email: cleanString(input.email, 160).toLowerCase(),
    service: cleanString(input.service, 80),
    budget: cleanString(input.budget, 80),
    timeline: cleanString(input.timeline, 80),
    message: cleanString(input.message, 1600),
    source: cleanString(input.source, 80) || 'website'
  };

  const errors = [];
  if (inquiry.name.length < 2) errors.push('Name is required.');
  if (inquiry.phone.length < 6 && inquiry.email.length < 5) errors.push('Phone or email is required.');
  if (inquiry.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inquiry.email)) errors.push('Email is not valid.');
  if (inquiry.message.length < 8) errors.push('Message is required.');
  return { inquiry, errors };
}

function publicInquiry(inquiry) {
  return {
    id: inquiry.id,
    createdAt: inquiry.createdAt,
    status: inquiry.status,
    name: inquiry.name,
    service: inquiry.service
  };
}

async function notifyWebhook(inquiry) {
  if (!WEBHOOK_URL || typeof fetch !== 'function') return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'raksa.inquiry.created', inquiry })
    });
  } catch (error) {
    console.warn('Webhook notification failed:', error.message);
  }
}

function serveStatic(req, res, pathname) {
  const cleanRoutes = {
    '/': 'index.html',
    '/home': 'index.html',
    '/profile': 'profile.html',
    '/projects': 'projects.html',
    '/admin': 'admin.html'
  };

  let rel = cleanRoutes[pathname];
  if (!rel) {
    try {
      rel = decodeURIComponent(pathname).replace(/^\/+/, '');
    } catch (error) {
      return notFound(res);
    }
  }

  const filePath = path.resolve(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      const fallback = path.join(PUBLIC_DIR, '404.html');
      if (fs.existsSync(fallback)) return streamFile(res, fallback, 404);
      return notFound(res);
    }
    streamFile(res, filePath, 200);
  });
}

function streamFile(res, filePath, status) {
  const ext = path.extname(filePath).toLowerCase();
  setCommonHeaders(res);
  res.statusCode = status;
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  if (['.html', '.css', '.js', '.svg'].includes(ext)) {
    res.setHeader('Cache-Control', 'no-cache');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
  }
  fs.createReadStream(filePath).pipe(res);
}

function csvEscape(value) {
  const str = String(value || '');
  return `"${str.replace(/"/g, '""')}"`;
}

function exportInquiriesCsv(inquiries) {
  const header = ['createdAt', 'status', 'name', 'company', 'phone', 'email', 'service', 'budget', 'timeline', 'message', 'note'];
  const rows = inquiries.map((item) => header.map((key) => csvEscape(item[key])).join(','));
  return [header.join(','), ...rows].join('\n');
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/health') {
    return json(res, 200, { ok: true, service: 'RAKSA website backend', time: new Date().toISOString() });
  }

  if (req.method === 'GET' && pathname === '/api/projects') {
    const db = readDb();
    const projects = db.projects
      .filter((project) => project.status !== 'hidden')
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(b.year || '').localeCompare(String(a.year || '')));
    return json(res, 200, { ok: true, projects });
  }

  if (req.method === 'POST' && pathname === '/api/inquiries') {
    if (isRateLimited(req, 'inquiry', 8, 1000 * 60 * 10)) {
      return json(res, 429, { ok: false, error: 'Too many requests. Please try again later.' });
    }
    try {
      const body = await readBody(req);
      const { inquiry, errors } = validateInquiry(body);
      if (errors.length) return json(res, 422, { ok: false, errors });
      const db = readDb();
      const saved = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        status: 'new',
        note: '',
        ip: getClientIp(req),
        userAgent: cleanString(req.headers['user-agent'], 250),
        ...inquiry
      };
      db.inquiries.unshift(saved);
      writeDb(db);
      notifyWebhook(saved);
      return json(res, 201, { ok: true, inquiry: publicInquiry(saved), message: 'Inquiry received.' });
    } catch (error) {
      return json(res, 400, { ok: false, error: error.message || 'Invalid request' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    if (isRateLimited(req, 'admin-login', 12, 1000 * 60 * 15)) {
      return json(res, 429, { ok: false, error: 'Too many login attempts. Please wait.' });
    }
    try {
      const body = await readBody(req);
      const password = String(body.password || '');
      const a = Buffer.from(password);
      const b = Buffer.from(ADMIN_PASSWORD);
      const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!ok) return json(res, 401, { ok: false, error: 'Invalid password' });
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { createdAt: Date.now(), expiresAt: Date.now() + SESSION_MAX_AGE_MS });
      res.setHeader('Set-Cookie', cookieString('raksa_session', token, SESSION_MAX_AGE_MS / 1000));
      return json(res, 200, { ok: true, expiresInSeconds: SESSION_MAX_AGE_MS / 1000 });
    } catch (error) {
      return json(res, 400, { ok: false, error: 'Invalid login request' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    const session = getSession(req);
    if (session) sessions.delete(session.token);
    res.setHeader('Set-Cookie', cookieString('raksa_session', '', 0));
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/me') {
    if (!requireAdmin(req, res)) return;
    return json(res, 200, { ok: true, admin: true });
  }

  if (pathname.startsWith('/api/admin/')) {
    if (!requireAdmin(req, res)) return;

    const db = readDb();

    if (req.method === 'GET' && pathname === '/api/admin/inquiries') {
      return json(res, 200, { ok: true, inquiries: db.inquiries });
    }

    if (req.method === 'GET' && pathname === '/api/admin/inquiries.csv') {
      return send(res, 200, exportInquiriesCsv(db.inquiries), {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="raksa-inquiries.csv"'
      });
    }

    const inquiryMatch = pathname.match(/^\/api\/admin\/inquiries\/([^/]+)$/);
    if (inquiryMatch && req.method === 'PATCH') {
      try {
        const body = await readBody(req);
        const id = inquiryMatch[1];
        const item = db.inquiries.find((entry) => entry.id === id);
        if (!item) return notFound(res);
        if (body.status) item.status = cleanString(body.status, 40);
        if (body.note !== undefined) item.note = cleanString(body.note, 1000);
        item.updatedAt = new Date().toISOString();
        writeDb(db);
        return json(res, 200, { ok: true, inquiry: item });
      } catch (error) {
        return json(res, 400, { ok: false, error: 'Invalid update request' });
      }
    }

    if (inquiryMatch && req.method === 'DELETE') {
      const id = inquiryMatch[1];
      const before = db.inquiries.length;
      db.inquiries = db.inquiries.filter((entry) => entry.id !== id);
      if (db.inquiries.length === before) return notFound(res);
      writeDb(db);
      return json(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/admin/projects') {
      return json(res, 200, { ok: true, projects: db.projects });
    }

    if (req.method === 'POST' && pathname === '/api/admin/projects') {
      try {
        const body = await readBody(req);
        const project = cleanProjectInput(body);
        project.id = crypto.randomUUID();
        project.createdAt = new Date().toISOString();
        db.projects.unshift(project);
        writeDb(db);
        return json(res, 201, { ok: true, project });
      } catch (error) {
        return json(res, 400, { ok: false, error: 'Invalid project request' });
      }
    }

    const projectMatch = pathname.match(/^\/api\/admin\/projects\/([^/]+)$/);
    if (projectMatch && req.method === 'PATCH') {
      try {
        const body = await readBody(req);
        const id = projectMatch[1];
        const project = db.projects.find((entry) => entry.id === id);
        if (!project) return notFound(res);
        Object.assign(project, cleanProjectInput({ ...project, ...body }));
        project.updatedAt = new Date().toISOString();
        writeDb(db);
        return json(res, 200, { ok: true, project });
      } catch (error) {
        return json(res, 400, { ok: false, error: 'Invalid project update' });
      }
    }

    if (projectMatch && req.method === 'DELETE') {
      const id = projectMatch[1];
      const before = db.projects.length;
      db.projects = db.projects.filter((entry) => entry.id !== id);
      if (db.projects.length === before) return notFound(res);
      writeDb(db);
      return json(res, 200, { ok: true });
    }
  }

  return notFound(res);
}

function cleanProjectInput(body) {
  const project = {
    title: cleanString(body.title, 160),
    location: cleanString(body.location, 140),
    category: cleanString(body.category, 80),
    year: cleanString(body.year, 20),
    featured: Boolean(body.featured),
    status: ['active', 'hidden'].includes(body.status) ? body.status : 'active',
    image: cleanString(body.image, 240) || '/assets/img/project-placeholder-1.svg',
    description: cleanString(body.description, 800),
    tags: cleanTags(body.tags)
  };
  if (project.title.length < 2) throw new Error('Project title is required');
  return project;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch((error) => {
      console.error('API error:', error);
      json(res, 500, { ok: false, error: 'Server error' });
    });
    return;
  }

  if (!['GET', 'HEAD'].includes(req.method)) return methodNotAllowed(res);
  serveStatic(req, res, pathname);
});

ensureDataFile();
server.listen(PORT, HOST, () => {
  console.log(`RAKSA website running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  if (ADMIN_PASSWORD === 'RAKSA@2026') {
    console.log('Default admin password is active. Change ADMIN_PASSWORD before going live.');
  }
});
