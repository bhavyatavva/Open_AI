import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { generateArtifact } from './gemini.ts';
import {
  DEFAULT_PROFILE,
  KINDS,
  validateArtifact,
  validateProfile,
  type Artifact,
  type Job,
  type Kind,
  type Profile,
  type ProjectRecord,
  type SessionRecord,
  type Source,
  type UserRecord,
} from './schema.ts';

interface RateLimitBucket {
  key: string;
  count: number;
  expires: number;
}

interface DbState {
  users: UserRecord[];
  sessions: SessionRecord[];
  projects: ProjectRecord[];
  limits: RateLimitBucket[];
  jobsHistory: { user_id: string; created: number }[];
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function nowSec(): number {
  return Date.now() / 1000;
}

export function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, 64);
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

const DUMMY_HASH = hashPassword(crypto.randomBytes(24).toString('base64url'));

function resolveDbPath(): string {
  const localDir = path.resolve(process.cwd(), '.data');
  try {
    fs.mkdirSync(localDir, { recursive: true });
    return path.join(localDir, 'lessonly-db.json');
  } catch {
    return path.join('/tmp', 'lessonly-db.json');
  }
}

const DB_PATH = resolveDbPath();

function loadDb(): DbState {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Partial<DbState>;
      return {
        users: Array.isArray(raw.users) ? raw.users : [],
        sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
        projects: Array.isArray(raw.projects) ? raw.projects : [],
        limits: Array.isArray(raw.limits) ? raw.limits : [],
        jobsHistory: Array.isArray(raw.jobsHistory) ? raw.jobsHistory : [],
      };
    }
  } catch {
    // Fall back to clean state if file is unreadable
  }
  return { users: [], sessions: [], projects: [], limits: [], jobsHistory: [] };
}

const db: DbState = loadDb();

// Mark interrupted running jobs from previous process exits as failed
{
  const current = nowSec();
  let changed = false;
  for (const p of db.projects) {
    if (p.job && (p.job.state === 'running' || p.job.state === 'queued')) {
      p.job.state = 'failed';
      p.job.error =
        'Worker interrupted. Completed artifacts were preserved; retry remaining types.';
      p.updated = current;
      changed = true;
    }
  }
  if (changed) persistDb();
}

function persistDb(): void {
  try {
    const tmp = `${DB_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db), 'utf8');
    fs.renameSync(tmp, DB_PATH);
  } catch {
    // Non-fatal in ephemeral containers
  }
}

export function rateLimit(key: string, cap: number, seconds: number): void {
  const now = nowSec();
  const bucket = Math.floor(now / seconds);
  const bucketKey = digest(`${key}:${bucket}`);
  db.limits = db.limits.filter((l) => l.expires >= now);
  let entry = db.limits.find((l) => l.key === bucketKey);
  if (!entry) {
    entry = { key: bucketKey, count: 0, expires: now + seconds };
    db.limits.push(entry);
  }
  entry.count += 1;
  persistDb();
  if (entry.count > cap) {
    throw new ApiError('Request limit reached. Please try again later.', 429);
  }
}

export function publicUser(user: UserRecord) {
  return { id: user.id, name: user.name, email: user.email };
}

export function registerUser(
  rawEmail: string,
  rawName: string,
  password: string,
  inviteCode = '',
): UserRecord {
  const requiredCode = process.env.REGISTRATION_CODE || '';
  if (requiredCode) {
    const a = Buffer.from(inviteCode);
    const b = Buffer.from(requiredCode);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new ApiError('A valid workspace invitation code is required.', 403);
    }
  }

  const email = rawEmail.trim().toLowerCase();
  const name = rawName.trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    name.length < 1 ||
    name.length > 100 ||
    password.length < 12 ||
    password.length > 128
  ) {
    throw new ApiError(
      'Use a valid email, name and a password of 12–128 characters.',
    );
  }

  if (db.users.some((u) => u.email === email)) {
    throw new ApiError('Unable to register this email. Try signing in.', 409);
  }

  const user: UserRecord = {
    id: crypto.randomUUID(),
    email,
    name,
    passwordHash: hashPassword(password),
    created: nowSec(),
  };
  db.users.push(user);
  persistDb();
  return user;
}

export function authenticateUser(rawEmail: string, password: string): UserRecord {
  const email = rawEmail.trim().toLowerCase().slice(0, 254);
  const user = db.users.find((u) => u.email === email);
  const hashToCheck = user ? user.passwordHash : DUMMY_HASH;
  const ok = verifyPassword(password.slice(0, 129), hashToCheck);
  if (!ok || !user) {
    throw new ApiError('Email or password is incorrect.', 401);
  }
  return user;
}

export function createSession(
  user: UserRecord,
  previousTokenDigest?: string,
): { token: string; csrf: string } {
  const now = nowSec();
  db.sessions = db.sessions.filter(
    (s) => s.expires > now && s.tokenDigest !== previousTokenDigest,
  );
  const token = crypto.randomBytes(36).toString('base64url');
  const csrf = crypto.randomBytes(28).toString('base64url');
  db.sessions.push({
    tokenDigest: digest(token),
    user_id: user.id,
    csrf,
    expires: now + 86400,
  });
  persistDb();
  return { token, csrf };
}

export function getSession(
  token: string,
): { session: SessionRecord; user: UserRecord } | null {
  if (!token) return null;
  const now = nowSec();
  const tokenDigest = digest(token);
  const session = db.sessions.find(
    (s) => s.tokenDigest === tokenDigest && s.expires > now,
  );
  if (!session) return null;
  const user = db.users.find((u) => u.id === session.user_id);
  if (!user) return null;
  return { session, user };
}

export function deleteSession(tokenDigest: string): void {
  db.sessions = db.sessions.filter((s) => s.tokenDigest !== tokenDigest);
  persistDb();
}

export function changeUserPassword(
  user: UserRecord,
  current: string,
  nextPassword: string,
): void {
  if (
    !verifyPassword(current.slice(0, 129), user.passwordHash) ||
    nextPassword.length < 12 ||
    nextPassword.length > 128
  ) {
    throw new ApiError(
      'Check your current password; the new password must have 12–128 characters.',
    );
  }
  user.passwordHash = hashPassword(nextPassword);
  db.sessions = db.sessions.filter((s) => s.user_id !== user.id);
  persistDb();
}

export function serializeProject(p: ProjectRecord, full = true) {
  const job: Job | null = p.job
    ? {
        id: p.job.id,
        state: p.job.state,
        kinds: p.job.kinds,
        completed: p.job.completed,
        error: p.job.error,
      }
    : null;
  const out: Record<string, unknown> = {
    id: p.id,
    title: p.title,
    filename: p.filename,
    settings: p.settings,
    created: p.created,
    updated: p.updated,
    artifact_count: p.artifacts.length,
    reviewed_count: p.artifacts.filter((a) => a.reviewed).length,
    kinds: p.artifacts.map((a) => a.kind),
    job,
  };
  if (full) {
    out.source = p.source;
    out.artifacts = p.artifacts;
  } else {
    out.source = [];
    out.artifacts = [];
  }
  return out;
}

export function listProjects(userId: string) {
  return db.projects
    .filter((p) => p.user_id === userId)
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 200)
    .map((p) => serializeProject(p, false));
}

export function listFullProjects(userId: string) {
  return db.projects
    .filter((p) => p.user_id === userId)
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 200)
    .map((p) => serializeProject(p, true));
}

export function getOwnedProject(userId: string, projectId: string): ProjectRecord {
  const p = db.projects.find((x) => x.id === projectId && x.user_id === userId);
  if (!p) {
    throw new ApiError('Project not found.', 404);
  }
  return p;
}

export function createProject(
  userId: string,
  title: string,
  filename: string,
  source: Source[],
  rawSettings?: unknown,
): ProjectRecord {
  const count = db.projects.filter((p) => p.user_id === userId).length;
  if (count >= 200) {
    throw new ApiError(
      'Your workspace has reached 200 projects. Export and remove an older project before adding another.',
      409,
    );
  }
  const settings = rawSettings ? validateProfile(rawSettings) : { ...DEFAULT_PROFILE };
  const now = nowSec();
  const project: ProjectRecord = {
    id: crypto.randomUUID(),
    user_id: userId,
    title: title.trim().slice(0, 180) || 'Untitled lesson',
    filename: filename.slice(0, 180),
    settings,
    source,
    artifacts: [],
    job: null,
    created: now,
    updated: now,
  };
  db.projects.push(project);
  persistDb();
  return project;
}

export function updateProject(
  userId: string,
  projectId: string,
  data: { settings?: unknown; title?: unknown },
): ProjectRecord {
  const p = getOwnedProject(userId, projectId);
  if (p.job && (p.job.state === 'queued' || p.job.state === 'running')) {
    throw new ApiError(
      'Wait for generation to finish before changing the learning profile.',
      409,
    );
  }
  if (data.settings !== undefined) {
    p.settings = validateProfile(data.settings);
  }
  if (typeof data.title === 'string' && data.title.trim()) {
    p.title = data.title.trim().slice(0, 180);
  }
  p.updated = nowSec();
  persistDb();
  return p;
}

export function deleteProject(userId: string, projectId: string): void {
  const p = getOwnedProject(userId, projectId);
  if (p.job && (p.job.state === 'queued' || p.job.state === 'running')) {
    throw new ApiError(
      'Wait for generation to finish before deleting the project.',
      409,
    );
  }
  db.projects = db.projects.filter((x) => x.id !== projectId);
  persistDb();
}

export function enqueueGenerationJob(
  userId: string,
  projectId: string,
  rawKinds: unknown,
): Job {
  const p = getOwnedProject(userId, projectId);
  if (
    !Array.isArray(rawKinds) ||
    rawKinds.length === 0 ||
    rawKinds.length > 9 ||
    rawKinds.some((k) => !(KINDS as readonly string[]).includes(String(k))) ||
    new Set(rawKinds).size !== rawKinds.length
  ) {
    throw new ApiError('Choose one or more distinct artifact types.');
  }
  const selectedKinds = rawKinds as Kind[];

  if (p.job && (p.job.state === 'queued' || p.job.state === 'running')) {
    throw new ApiError('A generation job is already active for this project.', 409);
  }

  const dailyLimit = Number(process.env.DAILY_JOB_LIMIT || '30');
  const dayAgo = nowSec() - 86400;
  db.jobsHistory = db.jobsHistory.filter((j) => j.created > dayAgo);
  const recentJobs = db.jobsHistory.filter((j) => j.user_id === userId).length;
  if (recentJobs >= dailyLimit) {
    throw new ApiError(
      'Daily generation limit reached. Please try again tomorrow.',
      429,
    );
  }

  const job: Job & { created: number } = {
    id: crypto.randomUUID(),
    state: 'queued',
    kinds: selectedKinds,
    completed: 0,
    error: '',
    created: nowSec(),
  };
  p.job = job;
  db.jobsHistory.push({ user_id: userId, created: job.created });
  persistDb();

  // Launch background async job
  void runGenerationJob(p, job.id);

  return {
    id: job.id,
    state: job.state,
    kinds: job.kinds,
    completed: job.completed,
    error: job.error,
  };
}

async function runGenerationJob(project: ProjectRecord, jobId: string): Promise<void> {
  if (!project.job || project.job.id !== jobId) return;
  project.job.state = 'running';
  persistDb();

  const kinds = [...project.job.kinds];
  const sourceSnapshot = structuredClone(project.source);
  const settingsSnapshot: Profile = structuredClone(project.settings);

  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    try {
      const data = await generateArtifact(sourceSnapshot, settingsSnapshot, kind);
      if (!project.job || project.job.id !== jobId || project.job.state !== 'running') {
        return;
      }
      const now = nowSec();
      const artifact: Artifact = {
        id: crypto.randomUUID(),
        kind,
        data,
        profile: settingsSnapshot,
        revision: 1,
        reviewed: false,
        created: now,
        updated: now,
      };
      project.artifacts.push(artifact);
      project.job.completed = i + 1;
      project.updated = now;
      persistDb();
    } catch (err) {
      if (project.job && project.job.id === jobId) {
        project.job.state = 'failed';
        project.job.error =
          err instanceof Error
            ? err.message.slice(0, 500)
            : 'Generation failed unexpectedly. Please retry later.';
        project.updated = nowSec();
        persistDb();
      }
      return;
    }
  }

  if (project.job && project.job.id === jobId) {
    project.job.state = 'completed';
    project.updated = nowSec();
    persistDb();
  }
}

export function updateArtifactRecord(
  userId: string,
  projectId: string,
  artifactId: string,
  body: { data?: unknown; revision?: unknown; reviewed?: unknown },
): Artifact {
  const p = getOwnedProject(userId, projectId);
  if (p.job && (p.job.state === 'queued' || p.job.state === 'running')) {
    throw new ApiError('Wait for generation to finish before editing.', 409);
  }
  const artifact = p.artifacts.find((a) => a.id === artifactId);
  if (!artifact) {
    throw new ApiError('Artifact not found.', 404);
  }
  if (body.revision !== artifact.revision) {
    throw new ApiError(
      'This artifact changed in another session. Reopen it before editing.',
      409,
    );
  }

  const nextData = validateArtifact(body.data ?? artifact.data, p.source, artifact.kind);
  const changed = JSON.stringify(nextData) !== JSON.stringify(artifact.data);
  if (changed) {
    for (const sec of nextData.sections) {
      sec.grounding = 'Needs educator review';
    }
  }
  artifact.data = nextData;
  artifact.reviewed = Boolean(body.reviewed) && !changed;
  artifact.revision += 1;
  const now = nowSec();
  artifact.updated = now;
  p.updated = now;
  persistDb();
  return artifact;
}

export function importProjectRecord(
  userId: string,
  rawPayload: unknown,
): ProjectRecord {
  const count = db.projects.filter((p) => p.user_id === userId).length;
  if (count >= 200) {
    throw new ApiError(
      'Your workspace has reached 200 projects. Export and remove an older project before importing another.',
      409,
    );
  }
  if (!rawPayload || typeof rawPayload !== 'object') {
    throw new ApiError('Please select a valid Lessonly JSON export file.');
  }
  const raw = rawPayload as Record<string, unknown>;
  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim().slice(0, 180)
      : 'Imported lesson';
  const filename =
    typeof raw.filename === 'string' && raw.filename.trim()
      ? raw.filename.trim().slice(0, 180)
      : 'imported-lesson.json';
  const settings = validateProfile(raw.settings);

  if (!Array.isArray(raw.source) || raw.source.length === 0) {
    throw new ApiError('Imported file is missing source passages.');
  }
  const source: Source[] = raw.source
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const s = item as Record<string, unknown>;
      const text = typeof s.text === 'string' ? s.text.trim() : '';
      if (!text) return null;
      const id =
        typeof s.id === 'string' && s.id.trim() ? s.id.trim() : `S${idx + 1}`;
      const page = typeof s.page === 'number' ? s.page : null;
      return { id, page, text };
    })
    .filter((x): x is Source => Boolean(x));

  if (source.length === 0) {
    throw new ApiError('Imported file has no valid source passages.');
  }

  const now = nowSec();
  const artifacts: Artifact[] = [];
  if (Array.isArray(raw.artifacts)) {
    for (const rawArt of raw.artifacts) {
      if (!rawArt || typeof rawArt !== 'object') continue;
      const a = rawArt as Record<string, unknown>;
      const kindStr = String(a.kind || '');
      if (!(KINDS as readonly string[]).includes(kindStr)) continue;
      const kind = kindStr as Kind;
      const data = validateArtifact(a.data, source, kind);
      artifacts.push({
        id: crypto.randomUUID(),
        kind,
        data,
        profile: a.profile ? validateProfile(a.profile) : settings,
        revision: Number(a.revision) > 0 ? Math.floor(Number(a.revision)) : 1,
        reviewed: Boolean(a.reviewed),
        created: Number(a.created) || now,
        updated: Number(a.updated) || now,
      });
    }
  }

  const project: ProjectRecord = {
    id: crypto.randomUUID(),
    user_id: userId,
    title,
    filename,
    settings,
    source,
    artifacts,
    job: null,
    created: now,
    updated: now,
  };
  db.projects.push(project);
  persistDb();
  return project;
}

