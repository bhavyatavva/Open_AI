import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { extractSource } from './server/extract.ts';
import { GEMINI_MODEL, isAiReady } from './server/gemini.ts';
import {
  ApiError,
  authenticateUser,
  changeUserPassword,
  createProject,
  createSession,
  deleteProject,
  deleteSession,
  enqueueGenerationJob,
  getOwnedProject,
  getSession,
  importProjectRecord,
  listFullProjects,
  listProjects,
  publicUser,
  rateLimit,
  registerUser,
  serializeProject,
  updateArtifactRecord,
  updateProject,
} from './server/store.ts';
import { SAMPLES } from './src/samples.ts';
import { serializeExport } from './src/serializers.ts';
import type { Project } from './src/types.ts';

interface AuthContext {
  user: ReturnType<typeof getSession> extends infer T
    ? T extends { user: infer U }
      ? U
      : never
    : never;
  session: ReturnType<typeof getSession> extends infer T
    ? T extends { session: infer S }
      ? S
      : never
    : never;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext | null;
    }
  }
}

const PORT = Number(process.env.PORT || 3000);
const PRODUCTION = process.env.NODE_ENV === 'production';

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function parseMultipartFile(
  body: Buffer,
  contentType: string,
): { filename: string; data: Buffer } | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!match) return null;
  const boundary = match[1] || match[2];
  const delimiter = Buffer.from(`--${boundary}`);
  const headerEndMarker = Buffer.from('\r\n\r\n');

  let pos = body.indexOf(delimiter);
  while (pos !== -1) {
    pos += delimiter.length;
    if (body[pos] === 45 && body[pos + 1] === 45) break; // '--' end boundary
    if (body[pos] === 13 && body[pos + 1] === 10) pos += 2;

    const headerEnd = body.indexOf(headerEndMarker, pos);
    if (headerEnd === -1) break;

    const headerStr = body.subarray(pos, headerEnd).toString('utf8');
    const dataStart = headerEnd + 4;
    const nextDelimiter = body.indexOf(delimiter, dataStart);
    if (nextDelimiter === -1) break;

    let dataEnd = nextDelimiter;
    if (body[dataEnd - 2] === 13 && body[dataEnd - 1] === 10) {
      dataEnd -= 2;
    }

    const nameMatch = headerStr.match(/name="([^"]+)"/i);
    const fileMatch = headerStr.match(/filename="([^"]*)"/i);
    if (nameMatch?.[1] === 'file' && fileMatch) {
      const safeName = path.basename(fileMatch[1] || 'notes.txt').slice(0, 180);
      return {
        filename: safeName,
        data: body.subarray(dataStart, dataEnd),
      };
    }
    pos = nextDelimiter;
  }
  return null;
}

function originAllowed(req: Request): boolean {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const reqHost = req.get('host');
    if (reqHost && originHost === reqHost) return true;
    if (process.env.APP_URL) {
      const appHost = new URL(process.env.APP_URL).host;
      if (originHost === appHost) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie('lessonly_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PRODUCTION,
    maxAge: 86400 * 1000,
    path: '/',
  });
}

async function ensureOfflineHtml(): Promise<string> {
  const offlinePath = path.resolve(
    process.cwd(),
    'dist',
    'lessonly-studio-offline.html',
  );
  if (!fs.existsSync(offlinePath)) {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    await promisify(execFile)(
      process.execPath,
      [path.resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
      {
        cwd: process.cwd(),
        env: { ...process.env, LESSONLY_SINGLEFILE: '1' },
      },
    );
  }
  return fs.readFileSync(offlinePath, 'utf8');
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
    }
    next();
  });

  // Body parsing: raw buffer for multipart upload, JSON for standard endpoints
  app.use(
    express.raw({
      type: 'multipart/form-data',
      limit: '26mb',
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  // Auth & CSRF guard for /api/*
  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies.lessonly_session || '';
    req.auth = token ? getSession(token) : null;

    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutation && !originAllowed(req)) {
      return next(new ApiError('This request must come from the application.', 403));
    }

    const isPublic =
      req.path === '/health' ||
      req.path === '/auth/login' ||
      req.path === '/auth/register';

    if (!isPublic && !req.auth) {
      return next(new ApiError('Please sign in to continue.', 401));
    }

    if (mutation && !isPublic && req.auth) {
      const provided = String(req.get('X-CSRF-Token') || '');
      const expected = req.auth.session.csrf;
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return next(
          new ApiError('Session token expired. Reload and try again.', 403),
        );
      }
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ai_ready: isAiReady(), model: GEMINI_MODEL });
  });

  app.post('/api/auth/register', (req, res, next) => {
    try {
      rateLimit(`register:${clientIp(req)}`, 20, 3600);
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
        string,
        unknown
      >;
      const user = registerUser(
        String(body.email || ''),
        String(body.name || ''),
        String(body.password || ''),
        String(body.code || ''),
      );
      const { token, csrf } = createSession(user, req.auth?.session.tokenDigest);
      setSessionCookie(res, token);
      res.json({
        user: publicUser(user),
        csrf,
        ai_ready: isAiReady(),
        model: GEMINI_MODEL,
        mode: 'server',
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/login', (req, res, next) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
        string,
        unknown
      >;
      const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
      rateLimit(`login-ip:${clientIp(req)}`, 40, 900);
      rateLimit(`login-email:${email}`, 15, 900);
      const user = authenticateUser(email, String(body.password || ''));
      const { token, csrf } = createSession(user, req.auth?.session.tokenDigest);
      setSessionCookie(res, token);
      res.json({
        user: publicUser(user),
        csrf,
        ai_ready: isAiReady(),
        model: GEMINI_MODEL,
        mode: 'server',
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/me', (req, res) => {
    const { user, session } = req.auth!;
    res.json({
      user: publicUser(user),
      csrf: session.csrf,
      ai_ready: isAiReady(),
      model: GEMINI_MODEL,
      mode: 'server',
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.auth) {
      deleteSession(req.auth.session.tokenDigest);
    }
    res.clearCookie('lessonly_session', { path: '/' });
    res.json({ ok: true });
  });

  app.post('/api/auth/password', (req, res, next) => {
    try {
      const { user } = req.auth!;
      rateLimit(`password:${user.id}`, 8, 900);
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
        string,
        unknown
      >;
      changeUserPassword(
        user,
        String(body.current || ''),
        String(body.password || ''),
      );
      res.clearCookie('lessonly_session', { path: '/' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/samples', (_req, res) => {
    res.json(SAMPLES);
  });

  app.post('/api/projects', (req, res, next) => {
    try {
      const { user } = req.auth!;
      rateLimit(`upload:${user.id}`, 40, 3600);
      const contentType = req.get('content-type') || '';

      if (contentType.includes('multipart/form-data') && Buffer.isBuffer(req.body)) {
        const parsed = parseMultipartFile(req.body, contentType);
        if (!parsed) {
          throw new ApiError('Please attach a PDF, Markdown, or text file.');
        }
        const source = extractSource(parsed.filename, parsed.data);
        const title = path.parse(parsed.filename).name.replace(/_/g, ' ').slice(0, 180);
        const project = createProject(user.id, title, parsed.filename, source);
        res.status(201).json(serializeProject(project, true));
        return;
      }

      const body = (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
        ? req.body
        : {}) as Record<string, unknown>;
      const filename = 'pasted-notes.md';
      const text = String(body.text || '');
      const source = extractSource(filename, Buffer.from(text, 'utf8'));
      const title =
        String(body.title || 'Untitled lesson').trim().slice(0, 180) ||
        'Untitled lesson';
      const project = createProject(user.id, title, filename, source, body.settings);
      res.status(201).json(serializeProject(project, true));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/projects/import', (req, res, next) => {
    try {
      const { user } = req.auth!;
      rateLimit(`upload:${user.id}`, 40, 3600);
      const project = importProjectRecord(user.id, req.body);
      res.status(201).json(serializeProject(project, true));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/projects', (req, res) => {
    res.json(listProjects(req.auth!.user.id));
  });

  app.get('/api/projects/:pid', (req, res, next) => {
    try {
      const project = getOwnedProject(req.auth!.user.id, req.params.pid);
      res.json(serializeProject(project, true));
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/projects/:pid', (req, res, next) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
        string,
        unknown
      >;
      const project = updateProject(req.auth!.user.id, req.params.pid, {
        settings: body.settings,
        title: body.title,
      });
      res.json(serializeProject(project, true));
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/projects/:pid', (req, res, next) => {
    try {
      deleteProject(req.auth!.user.id, req.params.pid);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/projects/:pid/generate', (req, res, next) => {
    try {
      if (!isAiReady()) {
        throw new ApiError(
          'AI is not configured. Ask the administrator to set GEMINI_API_KEY.',
          503,
        );
      }
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
        string,
        unknown
      >;
      const job = enqueueGenerationJob(req.auth!.user.id, req.params.pid, body.kinds);
      res.status(202).json(job);
    } catch (err) {
      next(err);
    }
  });

  app.patch('/api/projects/:pid/artifacts/:aid', (req, res, next) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<
        string,
        unknown
      >;
      const artifact = updateArtifactRecord(
        req.auth!.user.id,
        req.params.pid,
        req.params.aid,
        {
          data: body.data,
          revision: body.revision,
          reviewed: body.reviewed,
        },
      );
      res.json(artifact);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/projects/:pid/export/:fmt', (req, res, next) => {
    try {
      const project = getOwnedProject(req.auth!.user.id, req.params.pid);
      const fmt = req.params.fmt;
      if (fmt !== 'json' && fmt !== 'md' && fmt !== 'csv' && fmt !== 'anki') {
        throw new ApiError('Unknown export format.', 404);
      }
      const serialized = serializeExport(
        serializeProject(project, true) as unknown as Project,
        fmt,
      );
      res.setHeader('Content-Type', serialized.mime);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="lessonly-${project.id}.${serialized.extension}"`,
      );
      res.send(serialized.body);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/portable-html', async (req, res, next) => {
    try {
      const { user } = req.auth!;
      const projects = listFullProjects(user.id);
      const baseHtml = await ensureOfflineHtml();
      const snapshot = JSON.stringify({
        user: publicUser(user),
        projects,
        exportedAt: Date.now(),
      }).replace(/<\/script/gi, '<\\/script');

      const withoutOld = baseHtml.replace(
        /<script id="lessonly-snapshot" type="application\/json">[\s\S]*?<\/script>/i,
        '',
      );
      const portableHtml = withoutOld.replace(
        '</body>',
        `<script id="lessonly-snapshot" type="application/json">${snapshot}</script></body>`,
      );
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="lessonly-studio-offline.html"',
      );
      res.send(portableHtml);
    } catch (err) {
      next(err);
    }
  });

  // API error handler
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  });

  if (PRODUCTION) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Lessonly Teaching Studio listening on http://localhost:${PORT}`);
  });
}

void startServer();
