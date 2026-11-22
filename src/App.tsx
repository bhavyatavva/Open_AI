import {
  Suspense,
  lazy,
  memo,
  useState,
  useEffect,
  useCallback,
  type FormEvent,
} from 'react';
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
} from 'motion/react';
import {
  api,
  enterLocalOfflineWorkspace,
  isOfflineRuntime,
  setCsrf,
} from './api.ts';
import {
  kinds,
  blooms,
  type Kind,
  type Me,
  type Project,
  type Artifact,
  type Profile,
  type Sample,
} from './types.ts';
import { Mark, Badge, Empty } from './components.tsx';

const LibraryPage = lazy(() => import('./pages/LibraryPage.tsx'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage.tsx'));
const InsightsPage = lazy(() => import('./pages/InsightsPage.tsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx'));
const ArtifactEditorModal = lazy(
  () => import('./modals/ArtifactEditorModal.tsx'),
);
const LocalFilesModal = lazy(() => import('./modals/LocalFilesModal.tsx'));
const PasteModal = lazy(() =>
  import('./modals/SecondaryModals.tsx').then((mod) => ({
    default: mod.PasteModal,
  })),
);
const SourceModal = lazy(() =>
  import('./modals/SecondaryModals.tsx').then((mod) => ({
    default: mod.SourceModal,
  })),
);
const ConfirmDeleteModal = lazy(() =>
  import('./modals/SecondaryModals.tsx').then((mod) => ({
    default: mod.ConfirmDeleteModal,
  })),
);
const PrivacyModal = lazy(() =>
  import('./modals/SecondaryModals.tsx').then((mod) => ({
    default: mod.PrivacyModal,
  })),
);
const LazyArtifactView = lazy(() =>
  import('./components.tsx').then((mod) => ({ default: mod.ArtifactView })),
);

const defaults: Profile = {
  subject: 'General',
  level: 'Introductory',
  bloom: 'Understand',
  minutes: 45,
  language: 'English',
  tone: 'Warm & academic',
  objectives: '',
  standards: '',
};

const icons = ['▤', '?', '▥', '◫', '☷', '↗', '◎', '⌘', '✎'];
const descriptions = [
  'A purposeful classroom sequence',
  'Questions, answers & explanations',
  'Concepts that connect',
  'Practice that stays with you',
  'Clear criteria for assessment',
  'A quick check before they go',
  'Make room for good questions',
  'See how ideas fit together',
  'A clear brief and deliverables',
];

type Page = 'Studio' | 'Library' | 'Templates' | 'Insights' | 'Settings';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const ArtifactResultCard = memo(function ArtifactResultCard({
  a,
  idx,
  active,
  onOpen,
}: {
  a: Artifact;
  idx: number;
  active: boolean;
  onOpen: (artifact: Artifact) => void;
}) {
  return (
    <m.article
      className="result-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.16,
        delay: Math.min(idx * 0.025, 0.14),
        ease: EASE_OUT,
      }}
    >
      <div className="card-top">
        <span
          className={'result-icon color-' + (kinds.indexOf(a.kind) % 3)}
        >
          {icons[kinds.indexOf(a.kind)]}
        </span>
        <Badge>{a.reviewed ? 'Reviewed' : 'Needs review'}</Badge>
      </div>
      <h3>{a.kind}</h3>
      <p>{a.data.title}</p>
      <small>
        {a.data.sections.length} sections ·{' '}
        {a.data.flashcards.length ? `${a.data.flashcards.length} cards · ` : ''}
        revision {a.revision}
      </small>
      <button type="button" disabled={active} onClick={() => onOpen(a)}>
        Open artifact <span>→</span>
      </button>
    </m.article>
  );
});

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('Studio');
  const [projects, setProjects] = useState<Project[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [profile, setProfile] = useState<Profile>(defaults);
  const [selected, setSelected] = useState<Kind[]>([
    'Lesson plan',
    'Quiz bank',
    'Study guide',
    'Flashcards',
  ]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<Artifact | null>(null);
  const [view, setView] = useState<'preview' | 'edit'>('preview');
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [paste, setPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteTitle, setPasteTitle] = useState('My lesson');
  const [privacy, setPrivacy] = useState(false);
  const [localFilesOpen, setLocalFilesOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [printMode, setPrintMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null);

  const offlineMode = me?.mode === 'offline' || isOfflineRuntime();
  const active =
    project?.job?.state === 'queued' || project?.job?.state === 'running';
  const flashcards = Boolean(
    project?.artifacts.some((a) => a.data.flashcards.length > 0),
  );

  const loadLibrary = useCallback(async () => {
    setProjects(await api<Project[]>('/projects'));
  }, []);

  const refreshMe = useCallback(async () => {
    const data = await api<Me>('/me');
    setCsrf(data.csrf);
    setMe(data);
  }, []);

  useEffect(() => {
    refreshMe()
      .catch(() => {})
      .finally(() => setLoading(false));
    const expired = () => {
      setMe(null);
      setProject(null);
      setProjects([]);
      setEditor(null);
    };
    window.addEventListener('session-expired', expired);
    return () => window.removeEventListener('session-expired', expired);
  }, [refreshMe]);

  useEffect(() => {
    if (me) {
      loadLibrary().catch((e: Error) => setError(e.message));
      api<Sample[]>('/samples')
        .then(setSamples)
        .catch((e: Error) => setError(e.message));
    }
  }, [me?.user.id, loadLibrary, me]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!active || !project || offlineMode) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const next = await api<Project>('/projects/' + project.id);
        if (!stopped) {
          setProject(next);
          if (!['queued', 'running'].includes(next.job?.state || '')) {
            void loadLibrary();
            setNotice(
              next.job?.state === 'completed'
                ? 'Your learning kit is ready for review.'
                : 'Generation stopped. See the job details below.',
            );
          }
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, project?.id, loadLibrary, offlineMode, project]);

  useEffect(() => {
    const end = () => setPrintMode(false);
    window.addEventListener('afterprint', end);
    return () => window.removeEventListener('afterprint', end);
  }, []);

  useEffect(() => {
    if (printMode) {
      const id = setTimeout(() => window.print(), 100);
      return () => clearTimeout(id);
    }
  }, [printMode]);

  const task = useCallback(async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }, []);

  const choose = useCallback((p: Project) => {
    setProject(p);
    setProfile(p.settings);
    setPage('Studio');
    setEditor(null);
    setDiscardConfirm(false);
  }, []);

  const openProject = useCallback(
    async (id: string) => {
      await task('Opening project', async () =>
        choose(await api<Project>('/projects/' + id)),
      );
    },
    [task, choose],
  );

  const importJsonFile = useCallback(
    async (file: File) => {
      await task('Importing saved kit', async () => {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('Selected file is not valid JSON.');
        }
        const restored = await api<Project>('/projects/import', 'POST', parsed);
        choose(restored);
        await loadLibrary();
        setLocalFilesOpen(false);
        setNotice('Saved kit restored to your studio.');
      });
    },
    [task, choose, loadLibrary],
  );

  async function upload(file: File) {
    await task('Extracting source text', async () => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'md', 'markdown', 'txt'].includes(ext || '')) {
        throw new Error('Choose a PDF, Markdown or text file.');
      }
      if (file.size > 25 * 1024 * 1024) {
        throw new Error('File exceeds 25 MB.');
      }
      const form = new FormData();
      form.append('file', file);
      choose(await api<Project>('/projects', 'POST', form));
      await loadLibrary();
      setNotice('Source extracted and saved. Ready to shape your kit.');
    });
  }

  async function createText(text: string, title: string) {
    await task('Saving source', async () => {
      choose(
        await api<Project>('/projects', 'POST', {
          text,
          title,
          settings: profile,
        }),
      );
      await loadLibrary();
      setPaste(false);
      setPasteText('');
      setNotice('Source saved to your library.');
    });
  }

  async function saveProfile() {
    if (!project) return;
    const p = await api<Project>('/projects/' + project.id, 'PATCH', {
      settings: profile,
      title: project.title,
    });
    setProject(p);
    return p;
  }

  async function generate(types: Kind[] = selected) {
    if (!project) return;
    await task('Queueing generation', async () => {
      if (!types.length) throw new Error('Select at least one artifact.');
      await saveProfile();
      await api('/projects/' + project.id + '/generate', 'POST', {
        kinds: types,
      });
      setProject(await api<Project>('/projects/' + project.id));
      setNotice('Generation queued. You can return to this project later.');
      setEditor(null);
      setDiscardConfirm(false);
    });
  }

  async function saveArtifact(reviewed = false) {
    if (!project || !editor) return;
    await task('Saving artifact', async () => {
      const updated = await api<Artifact>(
        `/projects/${project.id}/artifacts/${editor.id}`,
        'PATCH',
        { data: editor.data, revision: editor.revision, reviewed },
      );
      setEditor(updated);
      setProject(await api<Project>('/projects/' + project.id));
      await loadLibrary();
      setView('preview');
      setDiscardConfirm(false);
      setNotice(
        reviewed
          ? 'Marked as reviewed.'
          : 'Edits saved. Review the updated content before sharing.',
      );
    });
  }

  async function copyArtifact() {
    if (!editor) return;
    await task('Copying artifact', async () => {
      await navigator.clipboard.writeText(
        [
          editor.data.title,
          ...editor.data.sections.map((s) => s.heading + '\n' + s.body),
          ...editor.data.flashcards.map((c) => c.front + '\n' + c.back),
        ].join('\n\n'),
      );
      setNotice('Artifact copied.');
    });
  }

  const exportFormat = useCallback(
    async (p: Project, fmt: 'json' | 'md' | 'csv' | 'anki') => {
      const { downloadProjectExport } = await import('./exports.ts');
      downloadProjectExport(p, fmt);
      setNotice(`Downloaded ${fmt.toUpperCase()} file.`);
    },
    [],
  );

  const exportKitHtml = useCallback(async (p: Project) => {
    const { downloadProjectHtml } = await import('./exports.ts');
    downloadProjectHtml(p);
    setNotice('Downloaded standalone kit webpage (.html) — double-click in File Explorer to view.');
  }, []);

  const exportPosterPng = useCallback(
    async (p: Project) => {
      await task('Rendering summary PNG image', async () => {
        const { downloadProjectPng } = await import('./exports.ts');
        await downloadProjectPng(p);
        setNotice('Downloaded visual summary image (.png).');
      });
    },
    [task],
  );

  const exportOfflineBundle = useCallback(async () => {
    if (!me) return;
    await task('Packaging offline studio', async () => {
      const { downloadPortableStudio } = await import('./exports.ts');
      let fullProjects = projects;
      if (project) {
        const hasCurrent = fullProjects.some((p) => p.id === project.id);
        fullProjects = hasCurrent
          ? fullProjects.map((p) => (p.id === project.id ? project : p))
          : [project, ...fullProjects];
      }
      await downloadPortableStudio(me.user, fullProjects, !offlineMode);
      setNotice(
        'Downloaded lessonly-studio-offline.html — open it directly from File Explorer anytime.',
      );
    });
  }, [me, projects, project, offlineMode, task]);

  const openEditorForArtifact = useCallback((a: Artifact) => {
    setEditor(structuredClone(a));
    setView('preview');
    setDiscardConfirm(false);
  }, []);

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        {loading ? (
          <div className="boot">
            <Mark />
            <p>Opening your teaching studio…</p>
          </div>
        ) : !me ? (
          <Auth
            onLogin={refreshMe}
            onOfflineEnter={async () => {
              const localMe = await enterLocalOfflineWorkspace();
              setCsrf(localMe.csrf);
              setMe(localMe);
            }}
          />
        ) : (
          <>
            <a href="#main" className="skip-link">
              Skip to content
            </a>
            <div className="app-shell">
              <aside className="sidebar">
                <a
                  className="brand"
                  href="#studio"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage('Studio');
                  }}
                >
                  <Mark />
                  <span>
                    lesson<span className="accent">ly</span>
                    <small>TEACHING STUDIO</small>
                  </span>
                </a>
                <div className="workspace">
                  <span className="avatar">
                    {me.user.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <small>YOUR WORKSPACE</small>
                    <strong>{me.user.name}</strong>
                  </div>
                </div>
                <p className="eyebrow">CREATE &amp; ORGANIZE</p>
                <nav aria-label="Main navigation">
                  {(
                    [
                      'Studio',
                      'Library',
                      'Templates',
                      'Insights',
                      'Settings',
                    ] as Page[]
                  ).map((p, i) => (
                    <button
                      type="button"
                      key={p}
                      className={page === p ? 'nav-item active' : 'nav-item'}
                      onClick={() => {
                        setPage(p);
                        setError('');
                      }}
                    >
                      <span aria-hidden="true">
                        {['◈', '▤', '⊞', '◌', '⚙'][i]}
                      </span>
                      {p === 'Studio'
                        ? 'Content studio'
                        : p === 'Library'
                          ? 'My library'
                          : p}
                      {p === 'Library' && <em>{projects.length}</em>}
                    </button>
                  ))}
                </nav>
                <div className="sidebar-bottom">
                  <div className="help-card">
                    <Mark />
                    <strong>Made for thoughtful teaching.</strong>
                    <p>Your expertise. A little more time.</p>
                  </div>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setLocalFilesOpen(true)}
                  >
                    Offline downloads &amp; File Explorer ↗
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setPrivacy(true)}
                  >
                    Privacy &amp; source handling ↗
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={!!busy}
                    onClick={() =>
                      task('Signing out', async () => {
                        await api('/auth/logout', 'POST');
                        setMe(null);
                        setProject(null);
                        setEditor(null);
                        setProjects([]);
                      })
                    }
                  >
                    Sign out
                  </button>
                </div>
              </aside>
              <main id="main">
                <header className="topbar">
                  <div>
                    <p className="eyebrow">
                      YOUR WORKSPACE / {page.toUpperCase()}
                    </p>
                    <h1>
                      {page === 'Studio' ? (
                        <>
                          Turn your teaching into <i>learning.</i>
                        </>
                      ) : page === 'Library' ? (
                        'Good work, worth keeping.'
                      ) : page === 'Templates' ? (
                        'A thoughtful starting point.'
                      ) : page === 'Insights' ? (
                        'Your teaching, in perspective.'
                      ) : (
                        'Make yourself at home.'
                      )}
                    </h1>
                    <p className="muted">
                      {page === 'Studio'
                        ? 'From a chapter of notes to a classroom of possibilities.'
                        : page === 'Library'
                          ? 'Revisit, refine, and share your saved learning kits.'
                          : page === 'Templates'
                            ? 'Choose a teaching pattern. Make it your own.'
                            : page === 'Insights'
                              ? 'A clear picture of the materials you have created.'
                              : 'Manage your account and workspace connection.'}
                    </p>
                  </div>
                  <Badge>
                    {offlineMode
                      ? 'Offline file mode'
                      : me.ai_ready
                        ? 'AI connected'
                        : 'AI setup required'}
                  </Badge>
                </header>

                <AnimatePresence>
                  {error && (
                    <m.div
                      key="error-banner"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16, ease: EASE_OUT }}
                      className="error"
                      role="alert"
                    >
                      {error}
                      <button
                        type="button"
                        aria-label="Dismiss error"
                        onClick={() => setError('')}
                      >
                        ×
                      </button>
                    </m.div>
                  )}
                </AnimatePresence>

                {busy && (
                  <div className="busy" role="status">
                    <span className="spinner" />
                    {busy}…
                  </div>
                )}

                <AnimatePresence mode="wait">
                  <m.div
                    key={page}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                  >
                    {page === 'Studio' && (
                      <>
                        <div className="stepper">
                          <span className={project ? 'done' : ''}>
                            01 <b>Source material</b>
                          </span>
                          <span>
                            02 <b>Shape your output</b>
                          </span>
                          <span
                            className={project?.artifacts.length ? 'done' : ''}
                          >
                            03 <b>Review &amp; export</b>
                          </span>
                        </div>

                        <div className="studio-grid">
                          <section>
                            <p className="eyebrow">START WITH WHAT YOU KNOW</p>
                            <h2>What are we working with?</h2>
                            <p className="muted">
                              Lecture notes, a chapter, or the outline of a
                              great lesson.
                            </p>
                            <div
                              className={
                                dragOver ? 'dropzone drag-active' : 'dropzone'
                              }
                              onDragOver={(e) => {
                                e.preventDefault();
                                if (!dragOver) setDragOver(true);
                              }}
                              onDragLeave={() => setDragOver(false)}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOver(false);
                                if (!busy && e.dataTransfer.files[0]) {
                                  void upload(e.dataTransfer.files[0]);
                                }
                              }}
                            >
                              <span className="upload-icon">↑</span>
                              <h3>Drop your teaching material here</h3>
                              <p>PDF, Markdown, or TXT · up to 25 MB</p>
                              <label className="button secondary file-button">
                                Browse files
                                <input
                                  aria-label="Upload teaching material"
                                  type="file"
                                  accept=".pdf,.md,.markdown,.txt"
                                  disabled={!!busy}
                                  onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                      void upload(e.target.files[0]);
                                    }
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setPaste(true)}
                              >
                                or paste your notes
                              </button>
                              <small>
                                PDFs need selectable text · max 100 pages
                              </small>
                            </div>

                            <div className="divider">
                              <span>OR START WITH A SAMPLE</span>
                            </div>
                            <div className="sample-list">
                              {samples.map((s, i) => (
                                <button
                                  type="button"
                                  disabled={!!busy}
                                  className="sample-card"
                                  key={s.id}
                                  onClick={() => void createText(s.text, s.title)}
                                >
                                  <span className={'sample-icon color-' + i}>
                                    {['∿', '⌘', '◉'][i]}
                                  </span>
                                  <span>
                                    <strong>{s.title}</strong>
                                    <small>
                                      {s.text.split(/\s+/).length} words ·
                                      Markdown source
                                    </small>
                                  </span>
                                  <b>↗</b>
                                </button>
                              ))}
                            </div>

                            {project && (
                              <div className="source-card">
                                <div className="source-header">
                                  <Badge>
                                    {project.filename.endsWith('.pdf')
                                      ? 'PDF'
                                      : 'TEXT'}
                                  </Badge>
                                  <strong>{project.title}</strong>
                                  <button
                                    type="button"
                                    className="text-button"
                                    onClick={() => setShowSource(true)}
                                  >
                                    Read source ↗
                                  </button>
                                </div>
                                <p>{project.source[0]?.text.slice(0, 240)}…</p>
                                <small>
                                  {project.source.length} cited passages · saved
                                  to library
                                </small>
                              </div>
                            )}
                          </section>

                          <section>
                            <p className="eyebrow">OUTPUT DESIGNER</p>
                            <h2>Shape your learning kit</h2>
                            <p className="muted">
                              A little structure. A lot of possibility.
                            </p>
                            <div className="panel">
                              <div className="panel-heading">
                                <span className="eyebrow">
                                  CHOOSE YOUR ARTIFACTS
                                </span>
                                <Badge>{selected.length} selected</Badge>
                              </div>
                              <div className="artifact-options">
                                {kinds.map((k, i) => (
                                  <label
                                    key={k}
                                    className={
                                      'artifact-option ' +
                                      (selected.includes(k) ? 'selected' : '')
                                    }
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selected.includes(k)}
                                      onChange={() =>
                                        setSelected(
                                          selected.includes(k)
                                            ? selected.filter((x) => x !== k)
                                            : [...selected, k],
                                        )
                                      }
                                    />
                                    <span className="artifact-symbol">
                                      {icons[i]}
                                    </span>
                                    <span>
                                      <strong>{k}</strong>
                                      <small>{descriptions[i]}</small>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            <div className="panel">
                              <p className="eyebrow">LEARNER CALIBRATION</p>
                              <fieldset disabled={active || !!busy}>
                                <legend className="sr-only">
                                  Learning profile
                                </legend>
                                <label>
                                  Difficulty
                                  <select
                                    value={profile.level}
                                    onChange={(e) =>
                                      setProfile({
                                        ...profile,
                                        level: e.target
                                          .value as Profile['level'],
                                      })
                                    }
                                  >
                                    {[
                                      'Introductory',
                                      'Intermediate',
                                      'Advanced',
                                    ].map((x) => (
                                      <option key={x}>{x}</option>
                                    ))}
                                  </select>
                                </label>
                                <p className="calibration-copy">
                                  {profile.level === 'Introductory'
                                    ? 'Build confidence through clear concepts and guided practice.'
                                    : profile.level === 'Intermediate'
                                      ? 'Connect ideas and develop independent reasoning.'
                                      : 'Evaluate evidence and transfer ideas to new contexts.'}
                                </p>
                                <label>
                                  Bloom’s focus
                                  <select
                                    value={profile.bloom}
                                    onChange={(e) =>
                                      setProfile({
                                        ...profile,
                                        bloom: e.target.value,
                                      })
                                    }
                                  >
                                    {blooms.map((x) => (
                                      <option key={x}>{x}</option>
                                    ))}
                                  </select>
                                </label>
                                <div className="field-grid">
                                  <label>
                                    Subject
                                    <input
                                      maxLength={100}
                                      value={profile.subject}
                                      onChange={(e) =>
                                        setProfile({
                                          ...profile,
                                          subject: e.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Learning time (minutes)
                                    <input
                                      type="number"
                                      min={10}
                                      max={240}
                                      value={profile.minutes}
                                      onChange={(e) =>
                                        setProfile({
                                          ...profile,
                                          minutes: Number(e.target.value),
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Language
                                    <select
                                      value={profile.language}
                                      onChange={(e) =>
                                        setProfile({
                                          ...profile,
                                          language: e.target
                                            .value as Profile['language'],
                                        })
                                      }
                                    >
                                      {[
                                        'English',
                                        'Spanish',
                                        'French',
                                        'German',
                                        'Hindi',
                                      ].map((x) => (
                                        <option key={x}>{x}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    Tone
                                    <select
                                      value={profile.tone}
                                      onChange={(e) =>
                                        setProfile({
                                          ...profile,
                                          tone: e.target
                                            .value as Profile['tone'],
                                        })
                                      }
                                    >
                                      {[
                                        'Warm & academic',
                                        'Concise',
                                        'Conversational',
                                      ].map((x) => (
                                        <option key={x}>{x}</option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                                <details className="advanced">
                                  <summary>
                                    Learning objectives &amp; curriculum
                                    standards
                                  </summary>
                                  <label>
                                    Learning objectives
                                    <textarea
                                      maxLength={2000}
                                      value={profile.objectives}
                                      onChange={(e) =>
                                        setProfile({
                                          ...profile,
                                          objectives: e.target.value,
                                        })
                                      }
                                      placeholder="What should learners be able to do?"
                                    />
                                  </label>
                                  <label>
                                    Curriculum standards
                                    <textarea
                                      maxLength={1000}
                                      value={profile.standards}
                                      onChange={(e) =>
                                        setProfile({
                                          ...profile,
                                          standards: e.target.value,
                                        })
                                      }
                                      placeholder="Optional standards or assessment requirements"
                                    />
                                  </label>
                                </details>
                              </fieldset>
                            </div>

                            <button
                              type="button"
                              className="primary generate"
                              disabled={
                                !project ||
                                !selected.length ||
                                active ||
                                !!busy ||
                                !me.ai_ready
                              }
                              onClick={() => void generate()}
                            >
                              ✦{' '}
                              {active
                                ? 'Creating your learning kit…'
                                : 'Generate learning kit'}{' '}
                              <span>→</span>
                            </button>
                            <p className="generate-note">
                              {!project
                                ? 'Choose a source to begin.'
                                : offlineMode
                                  ? 'Opened in offline File Explorer mode. Viewing, editing, reviewing, and exports work locally.'
                                  : !me.ai_ready
                                    ? 'Ask your administrator to configure GEMINI_API_KEY.'
                                    : 'Generation sends source text to Google Gemini. Review all output before use.'}
                            </p>
                            {project && !active && (
                              <button
                                type="button"
                                className="text-button"
                                disabled={!!busy}
                                onClick={() =>
                                  task('Saving profile', async () => {
                                    await saveProfile();
                                    setNotice('Learning profile saved.');
                                  })
                                }
                              >
                                Save learning profile
                              </button>
                            )}
                          </section>
                        </div>

                        {project?.job && (
                          <section
                            className={
                              'job-panel ' +
                              (project.job.state === 'failed' ? 'failed' : '')
                            }
                            aria-live="polite"
                          >
                            <div>
                              <strong>
                                {active
                                  ? 'Your kit is taking shape'
                                  : project.job.state === 'failed'
                                    ? 'Generation needs attention'
                                    : 'Learning kit generated'}
                              </strong>
                              <p>
                                {project.job.completed} of{' '}
                                {project.job.kinds.length} artifacts saved ·{' '}
                                {project.job.state}
                              </p>
                              {project.job.error && <p>{project.job.error}</p>}
                            </div>
                            <progress
                              aria-label="Generation progress"
                              max={project.job.kinds.length}
                              value={project.job.completed}
                            />
                            {project.job.state === 'failed' && (
                              <button
                                type="button"
                                disabled={!!busy || !me.ai_ready}
                                onClick={() =>
                                  void generate(
                                    project.job!.kinds.slice(
                                      project.job!.completed,
                                    ),
                                  )
                                }
                              >
                                Retry remaining artifacts
                              </button>
                            )}
                          </section>
                        )}

                        <section className="results">
                          <div className="results-heading">
                            <div>
                              <p className="eyebrow">YOUR LEARNING KIT</p>
                              <h2>Ready for your perspective.</h2>
                              <p className="muted">
                                Review, refine, and make every artifact your own.
                              </p>
                            </div>
                            {!!project?.artifacts.length ? (
                              <div className="export-actions">
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() =>
                                    void exportFormat(project, 'md')
                                  }
                                >
                                  ↓ Markdown
                                </button>
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() =>
                                    void exportFormat(project, 'json')
                                  }
                                >
                                  ↓ JSON
                                </button>
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() => void exportKitHtml(project)}
                                >
                                  ↓ Kit HTML
                                </button>
                                <button
                                  type="button"
                                  className="secondary"
                                  disabled={!!busy}
                                  onClick={() => void exportPosterPng(project)}
                                >
                                  ↓ Summary PNG
                                </button>
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() => setPrintMode(true)}
                                >
                                  Print / PDF
                                </button>
                                {flashcards && (
                                  <>
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() =>
                                        void exportFormat(project, 'csv')
                                      }
                                    >
                                      ↓ CSV
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary"
                                      onClick={() =>
                                        void exportFormat(project, 'anki')
                                      }
                                    >
                                      ↓ Anki TSV
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="primary"
                                  onClick={() => setLocalFilesOpen(true)}
                                >
                                  Offline &amp; File Explorer ↗
                                </button>
                              </div>
                            ) : (
                              <div className="export-actions">
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() => setLocalFilesOpen(true)}
                                >
                                  Offline &amp; File Explorer ↗
                                </button>
                              </div>
                            )}
                          </div>

                          {project?.artifacts.length ? (
                            <div className="artifact-grid">
                              {project.artifacts.map((a, idx) => (
                                <ArtifactResultCard
                                  key={a.id}
                                  a={a}
                                  idx={idx}
                                  active={active}
                                  onOpen={openEditorForArtifact}
                                />
                              ))}
                            </div>
                          ) : (
                            <Empty title="A fresh page, full of potential.">
                              Your generated artifacts will appear here.
                            </Empty>
                          )}
                        </section>
                      </>
                    )}

                    {page !== 'Studio' && (
                      <Suspense
                        fallback={
                          <div className="busy" role="status">
                            <span className="spinner" />
                            Loading workspace view…
                          </div>
                        }
                      >
                        {page === 'Library' && (
                          <LibraryPage
                            projects={projects}
                            busy={busy}
                            onOpen={(id) => void openProject(id)}
                            onDelete={setConfirmDelete}
                            onImportJson={(file) => void importJsonFile(file)}
                          />
                        )}
                        {page === 'Templates' && (
                          <TemplatesPage
                            onApply={(t) => {
                              setProfile({
                                ...profile,
                                level: t.level,
                                bloom: t.bloom,
                                minutes: t.minutes,
                              });
                              setSelected(t.types);
                              setPage('Studio');
                              setNotice(
                                'Template applied to the learning profile.',
                              );
                            }}
                          />
                        )}
                        {page === 'Insights' && (
                          <InsightsPage projects={projects} />
                        )}
                        {page === 'Settings' && (
                          <SettingsPage
                            me={me}
                            offlineMode={offlineMode}
                            busy={busy}
                            onRefreshMe={() =>
                              void task('Checking configuration', refreshMe)
                            }
                            onSignedOut={() => {
                              setMe(null);
                              setProject(null);
                              setProjects([]);
                            }}
                            onOpenLocalFiles={() => setLocalFilesOpen(true)}
                            onDownloadStudio={() => void exportOfflineBundle()}
                          />
                        )}
                      </Suspense>
                    )}
                  </m.div>
                </AnimatePresence>

                <footer>
                  <span>Lessonly Studio · 2.0</span>
                  <span>Made for the moments that make learning stick.</span>
                </footer>
              </main>
            </div>

            <div className="toast-wrap" aria-live="polite">
              <AnimatePresence>
                {notice && (
                  <m.div
                    key={notice}
                    initial={{ opacity: 0, y: 14, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: EASE_OUT }}
                    className="toast"
                    role="status"
                  >
                    ✓ {notice}
                  </m.div>
                )}
              </AnimatePresence>
            </div>

            <Suspense fallback={null}>
              {paste && (
                <PasteModal
                  title={pasteTitle}
                  text={pasteText}
                  busy={busy}
                  error={error}
                  onTitleChange={setPasteTitle}
                  onTextChange={setPasteText}
                  onSubmit={() => void createText(pasteText, pasteTitle)}
                  onClose={() => setPaste(false)}
                />
              )}

              {showSource && project && (
                <SourceModal
                  project={project}
                  onClose={() => setShowSource(false)}
                />
              )}

              {editor && project && (
                <ArtifactEditorModal
                  editor={editor}
                  project={project}
                  view={view}
                  discardConfirm={discardConfirm}
                  busy={busy}
                  active={active}
                  aiReady={me.ai_ready}
                  error={error}
                  onSetView={setView}
                  onSetDiscardConfirm={setDiscardConfirm}
                  onClose={() => {
                    setDiscardConfirm(false);
                    setEditor(null);
                  }}
                  onCopy={() => void copyArtifact()}
                  onRegenerate={(kind) => void generate([kind])}
                  onChangeEditor={setEditor}
                  onSave={(rev) => void saveArtifact(rev)}
                />
              )}

              {localFilesOpen && (
                <LocalFilesModal
                  project={project}
                  busy={busy}
                  onClose={() => setLocalFilesOpen(false)}
                  onDownloadStudio={() => void exportOfflineBundle()}
                  onDownloadKitHtml={(p) => void exportKitHtml(p)}
                  onDownloadPng={(p) => void exportPosterPng(p)}
                  onDownloadFormat={(p, fmt) => void exportFormat(p, fmt)}
                  onImportJson={(file) => void importJsonFile(file)}
                />
              )}

              {confirmDelete && (
                <ConfirmDeleteModal
                  project={confirmDelete}
                  busy={busy}
                  error={error}
                  onConfirm={() =>
                    void task('Deleting project', async () => {
                      await api('/projects/' + confirmDelete.id, 'DELETE');
                      if (project?.id === confirmDelete.id) setProject(null);
                      setConfirmDelete(null);
                      await loadLibrary();
                      setNotice('Project deleted.');
                    })
                  }
                  onClose={() => setConfirmDelete(null)}
                />
              )}

              {privacy && <PrivacyModal onClose={() => setPrivacy(false)} />}
            </Suspense>

            {printMode && project && (
              <div className="print-document">
                <h1>{project.title}</h1>
                <p>
                  {project.settings.subject} · {project.settings.level} ·{' '}
                  {project.settings.minutes} minutes
                </p>
                <Suspense fallback={null}>
                  {project.artifacts.map((a) => (
                    <LazyArtifactView
                      key={a.id}
                      artifact={a}
                      source={project.source}
                    />
                  ))}
                </Suspense>
                <h2>Source passages</h2>
                {project.source.map((s) => (
                  <section key={s.id}>
                    <h3>
                      {s.id} · {s.page ? 'Page ' + s.page : project.filename}
                    </h3>
                    <p>{s.text}</p>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </MotionConfig>
    </LazyMotion>
  );
}

function Auth({
  onLogin,
  onOfflineEnter,
}: {
  onLogin: () => Promise<void>;
  onOfflineEnter: () => Promise<void>;
}) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const offline = isOfflineRuntime();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError('');
    try {
      const result = await api<Me>(
        '/auth/' + (register ? 'register' : 'login'),
        'POST',
        data,
      );
      setCsrf(result.csrf);
      await onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="brand">
          <Mark />
          <span>
            lessonly<small>TEACHING STUDIO</small>
          </span>
        </div>
        <div>
          <p className="eyebrow">MORE ROOM FOR WHAT MATTERS</p>
          <h1>
            Good teaching
            <br />
            starts with
            <br />
            <i>a little space.</i>
          </h1>
          <p>
            Turn your materials into thoughtful lessons,
            <br />
            meaningful practice, and moments that stick.
          </p>
          <div className="paper-stack">
            <div>
              <span>01 / YOUR NEXT LESSON</span>
              <h3>A spark of understanding.</h3>
              <div className="paper-line" />
              <div className="paper-line short" />
              <p>Source → Structure → Possibility</p>
            </div>
          </div>
        </div>
        <small>Built around your expertise.</small>
      </section>
      <section className="auth-form">
        <div>
          <Badge>YOUR TEACHING WORKSPACE</Badge>
          <h2>{register ? 'Make room for better lessons.' : 'Welcome back.'}</h2>
          <p className="muted">
            {register
              ? 'Create your account using your workspace invitation.'
              : 'A fresh perspective on your next lesson awaits.'}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={100}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={register ? 12 : 1}
                maxLength={128}
                required
              />
            </label>
            {register && (
              <>
                <label>
                  Workspace invitation code
                  <input name="code" autoComplete="off" />
                </label>
                <small>
                  Use 12–128 characters for your password. Ask your
                  administrator for the invitation code if required.
                </small>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary" disabled={busy}>
              {busy
                ? 'Connecting…'
                : register
                  ? 'Create account →'
                  : 'Open my studio →'}
            </button>
          </form>
          <div className="auth-actions-extra">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError('');
              }}
            >
              {register
                ? 'Already have an account? Sign in'
                : 'New to Lessonly? Create an account'}
            </button>
            {offline && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void onOfflineEnter().finally(() => setBusy(false));
                }}
              >
                Open local browser studio →
              </button>
            )}
          </div>
          <p className="muted recovery">
            Forgot your password? Your workspace administrator can reset it.
          </p>
        </div>
      </section>
    </div>
  );
}
