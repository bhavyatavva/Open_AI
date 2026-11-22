import { SAMPLES } from './samples.ts';
import type {
  Artifact,
  ArtifactData,
  Kind,
  Me,
  Profile,
  Project,
  Source,
} from './types.ts';

let csrf = '';

export function setCsrf(token: string) {
  csrf = token;
}

export function isOfflineRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'file:';
}

interface SnapshotPayload {
  user?: Me['user'];
  projects?: Project[];
  exportedAt?: number;
}

const LOCAL_USERS_KEY = 'lessonly_local_users_v2';
const LOCAL_SESSION_KEY = 'lessonly_local_session_v2';
const LOCAL_PROJECTS_KEY = 'lessonly_local_projects_v2';

interface LocalUser {
  id: string;
  name: string;
  email: string;
  password: string;
}

function readSnapshot(): SnapshotPayload | null {
  try {
    const el = document.getElementById('lessonly-snapshot');
    if (!el?.textContent) return null;
    return JSON.parse(el.textContent) as SnapshotPayload;
  } catch {
    return null;
  }
}

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota issues
  }
}

function hydrateFromSnapshotIfNeeded(): void {
  if (!isOfflineRuntime()) return;
  const snap = readSnapshot();
  if (!snap) return;

  const session = readLocalJson<Me['user'] | null>(LOCAL_SESSION_KEY, null);
  const existingProjects = readLocalJson<Record<string, Project[]>>(
    LOCAL_PROJECTS_KEY,
    {},
  );
  const userId = snap.user?.id || 'local-educator';

  if (!session && snap.user) {
    writeLocalJson(LOCAL_SESSION_KEY, snap.user);
  }
  if (
    Array.isArray(snap.projects) &&
    snap.projects.length > 0 &&
    (!existingProjects[userId] || existingProjects[userId].length === 0)
  ) {
    existingProjects[userId] = snap.projects;
    writeLocalJson(LOCAL_PROJECTS_KEY, existingProjects);
  }
}

function makeUuid(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultProfile(): Profile {
  return {
    subject: 'General',
    level: 'Introductory',
    bloom: 'Understand',
    minutes: 45,
    language: 'English',
    tone: 'Warm & academic',
    objectives: '',
    standards: '',
  };
}

function getActiveLocalUser(): Me['user'] | null {
  hydrateFromSnapshotIfNeeded();
  return readLocalJson<Me['user'] | null>(LOCAL_SESSION_KEY, null);
}

function getLocalUserProjects(userId: string): Project[] {
  const all = readLocalJson<Record<string, Project[]>>(LOCAL_PROJECTS_KEY, {});
  return Array.isArray(all[userId]) ? all[userId] : [];
}

function saveLocalUserProjects(userId: string, list: Project[]): void {
  const all = readLocalJson<Record<string, Project[]>>(LOCAL_PROJECTS_KEY, {});
  all[userId] = list;
  writeLocalJson(LOCAL_PROJECTS_KEY, all);
}

export async function enterLocalOfflineWorkspace(): Promise<Me> {
  const snap = readSnapshot();
  const user: Me['user'] = snap?.user || {
    id: 'local-educator',
    name: 'Local Educator',
    email: 'studio@local.browser',
  };
  writeLocalJson(LOCAL_SESSION_KEY, user);
  hydrateFromSnapshotIfNeeded();
  return {
    user,
    csrf: 'local-offline',
    ai_ready: false,
    model: 'Offline File Mode',
    mode: 'offline',
  };
}

async function handleOfflineApi<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  if (path === '/me') {
    const user = getActiveLocalUser();
    if (!user) throw new Error('Please sign in to continue.');
    return {
      user,
      csrf: 'local-offline',
      ai_ready: false,
      model: 'Offline File Mode',
      mode: 'offline',
    } as T;
  }

  if (path === '/auth/register' && method === 'POST') {
    const data = (body || {}) as Record<string, string>;
    const email = (data.email || '').trim().toLowerCase();
    const name = (data.name || '').trim();
    const password = data.password || '';
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !name ||
      password.length < 12 ||
      password.length > 128
    ) {
      throw new Error(
        'Use a valid email, name and a password of 12–128 characters.',
      );
    }
    const users = readLocalJson<LocalUser[]>(LOCAL_USERS_KEY, []);
    if (users.some((u) => u.email === email)) {
      throw new Error('Unable to register this email. Try signing in.');
    }
    const newUser: LocalUser = { id: makeUuid(), name, email, password };
    users.push(newUser);
    writeLocalJson(LOCAL_USERS_KEY, users);
    const pub = { id: newUser.id, name: newUser.name, email: newUser.email };
    writeLocalJson(LOCAL_SESSION_KEY, pub);
    return {
      user: pub,
      csrf: 'local-offline',
      ai_ready: false,
      model: 'Offline File Mode',
      mode: 'offline',
    } as T;
  }

  if (path === '/auth/login' && method === 'POST') {
    const data = (body || {}) as Record<string, string>;
    const email = (data.email || '').trim().toLowerCase();
    const password = data.password || '';
    const users = readLocalJson<LocalUser[]>(LOCAL_USERS_KEY, []);
    const found = users.find(
      (u) => u.email === email && u.password === password,
    );
    if (!found) {
      throw new Error('Email or password is incorrect.');
    }
    const pub = { id: found.id, name: found.name, email: found.email };
    writeLocalJson(LOCAL_SESSION_KEY, pub);
    return {
      user: pub,
      csrf: 'local-offline',
      ai_ready: false,
      model: 'Offline File Mode',
      mode: 'offline',
    } as T;
  }

  if (path === '/auth/logout' && method === 'POST') {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    return { ok: true } as T;
  }

  if (path === '/auth/password' && method === 'POST') {
    const user = getActiveLocalUser();
    if (!user) throw new Error('Please sign in to continue.');
    const data = (body || {}) as Record<string, string>;
    const users = readLocalJson<LocalUser[]>(LOCAL_USERS_KEY, []);
    const record = users.find((u) => u.id === user.id);
    if (record) {
      if (
        record.password !== data.current ||
        !data.password ||
        data.password.length < 12
      ) {
        throw new Error(
          'Check your current password; the new password must have 12–128 characters.',
        );
      }
      record.password = data.password;
      writeLocalJson(LOCAL_USERS_KEY, users);
    }
    localStorage.removeItem(LOCAL_SESSION_KEY);
    return { ok: true } as T;
  }

  if (path === '/samples') {
    return SAMPLES as T;
  }

  const user = getActiveLocalUser();
  if (!user) throw new Error('Please sign in to continue.');

  if (path === '/projects' && method === 'GET') {
    return getLocalUserProjects(user.id).sort((a, b) => b.updated - a.updated) as T;
  }

  if (path === '/projects/import' && method === 'POST') {
    const raw = (body || {}) as Partial<Project>;
    if (!Array.isArray(raw.source) || raw.source.length === 0) {
      throw new Error('Imported file is missing source passages.');
    }
    const now = Date.now() / 1000;
    const artifacts = Array.isArray(raw.artifacts) ? raw.artifacts : [];
    const imported: Project = {
      id: makeUuid(),
      title: String(raw.title || 'Imported lesson').slice(0, 180),
      filename: String(raw.filename || 'imported-lesson.json').slice(0, 180),
      settings: raw.settings ? { ...defaultProfile(), ...raw.settings } : defaultProfile(),
      source: raw.source,
      artifacts,
      artifact_count: artifacts.length,
      reviewed_count: artifacts.filter((a) => a.reviewed).length,
      kinds: artifacts.map((a) => a.kind),
      job: null,
      created: now,
      updated: now,
    };
    const list = getLocalUserProjects(user.id);
    list.unshift(imported);
    saveLocalUserProjects(user.id, list);
    return imported as T;
  }

  if (path === '/projects' && method === 'POST') {
    const list = getLocalUserProjects(user.id);
    const now = Date.now() / 1000;
    let title = 'Untitled lesson';
    let filename = 'pasted-notes.md';
    let source: Source[] = [];
    let settings = defaultProfile();

    const { chunks, extractBrowserFile } = await import('./pdfExtract.ts');

    if (body instanceof FormData) {
      const file = body.get('file');
      if (!(file instanceof File)) {
        throw new Error('Choose a PDF, Markdown or text file.');
      }
      filename = file.name.slice(0, 180);
      title = filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ').slice(0, 180);
      source = await extractBrowserFile(file);
    } else {
      const data = (body || {}) as {
        text?: string;
        title?: string;
        settings?: Profile;
      };
      const text = String(data.text || '');
      source = chunks(text);
      const total = source.reduce((n, s) => n + s.text.length, 0);
      if (total < 40) {
        throw new Error('At least 40 text characters are required.');
      }
      title =
        String(data.title || 'Untitled lesson').trim().slice(0, 180) ||
        'Untitled lesson';
      settings = data.settings
        ? { ...defaultProfile(), ...data.settings }
        : defaultProfile();
    }

    const created: Project = {
      id: makeUuid(),
      title,
      filename,
      settings,
      created: now,
      updated: now,
      artifact_count: 0,
      reviewed_count: 0,
      kinds: [],
      job: null,
      source,
      artifacts: [],
    };
    list.unshift(created);
    saveLocalUserProjects(user.id, list);
    return created as T;
  }

  const singleMatch = path.match(/^\/projects\/([^/]+)$/);
  if (singleMatch) {
    const pid = singleMatch[1];
    const list = getLocalUserProjects(user.id);
    const idx = list.findIndex((p) => p.id === pid);
    if (idx === -1) throw new Error('Project not found.');
    const proj = list[idx];

    if (method === 'GET') {
      return proj as T;
    }
    if (method === 'PATCH') {
      const data = (body || {}) as { settings?: Profile; title?: string };
      if (data.settings) proj.settings = { ...proj.settings, ...data.settings };
      if (typeof data.title === 'string' && data.title.trim()) {
        proj.title = data.title.trim().slice(0, 180);
      }
      proj.updated = Date.now() / 1000;
      list[idx] = proj;
      saveLocalUserProjects(user.id, list);
      return proj as T;
    }
    if (method === 'DELETE') {
      saveLocalUserProjects(
        user.id,
        list.filter((p) => p.id !== pid),
      );
      return { ok: true } as T;
    }
  }

  const artMatch = path.match(/^\/projects\/([^/]+)\/artifacts\/([^/]+)$/);
  if (artMatch && method === 'PATCH') {
    const [, pid, aid] = artMatch;
    const list = getLocalUserProjects(user.id);
    const proj = list.find((p) => p.id === pid);
    if (!proj) throw new Error('Project not found.');
    const art = proj.artifacts.find((a) => a.id === aid);
    if (!art) throw new Error('Artifact not found.');
    const data = (body || {}) as {
      data?: ArtifactData;
      revision?: number;
      reviewed?: boolean;
    };
    if (data.revision !== art.revision) {
      throw new Error(
        'This artifact changed in another session. Reopen it before editing.',
      );
    }
    const nextData = data.data ?? art.data;
    const changed = JSON.stringify(nextData) !== JSON.stringify(art.data);
    if (changed) {
      nextData.sections = nextData.sections.map((s) => ({
        ...s,
        grounding: 'Needs educator review',
      }));
    }
    art.data = nextData;
    art.reviewed = Boolean(data.reviewed) && !changed;
    art.revision += 1;
    const now = Date.now() / 1000;
    art.updated = now;
    proj.updated = now;
    proj.reviewed_count = proj.artifacts.filter((a) => a.reviewed).length;
    proj.artifact_count = proj.artifacts.length;
    proj.kinds = proj.artifacts.map((a) => a.kind as Kind);
    saveLocalUserProjects(user.id, list);
    return art as T;
  }

  if (/^\/projects\/[^/]+\/generate$/.test(path) && method === 'POST') {
    throw new Error(
      'AI generation requires connecting to the studio server. You can edit, review, and export all saved kits offline.',
    );
  }

  throw new Error('Endpoint unavailable in local offline file mode.');
}

export async function api<T = unknown>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  if (isOfflineRuntime()) {
    return handleOfflineApi<T>(path, method, body);
  }

  const headers: Record<string, string> = {};
  const init: RequestInit = { method, credentials: 'same-origin', headers };
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch('/api' + path, init);
  } catch {
    throw new Error('Could not reach the studio server.');
  }

  if (res.status === 401 && path !== '/me' && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('session-expired'));
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data as T;
}
