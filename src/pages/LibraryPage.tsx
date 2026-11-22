import { memo, useMemo, useState } from 'react';
import { m } from 'motion/react';
import { Badge, Empty } from '../components.tsx';
import { kinds, type Kind, type Project } from '../types.ts';

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const LibraryCard = memo(function LibraryCard({
  p,
  index,
  onOpen,
  onDelete,
}: {
  p: Project;
  index: number;
  onOpen: (id: string) => void;
  onDelete: (project: Project) => void;
}) {
  return (
    <m.article
      className="library-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.16,
        delay: Math.min(index * 0.02, 0.12),
        ease: EASE_OUT,
      }}
    >
      <Badge>{p.settings.subject}</Badge>
      <h2>{p.title}</h2>
      <p>
        {p.artifact_count} artifacts · {p.settings.level}
      </p>
      <small>Updated {new Date(p.updated * 1000).toLocaleDateString()}</small>
      <div className="card-actions">
        <button type="button" className="primary" onClick={() => onOpen(p.id)}>
          Open project →
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => onDelete(p)}
        >
          Delete
        </button>
      </div>
    </m.article>
  );
});

export default function LibraryPage({
  projects,
  busy,
  onOpen,
  onDelete,
  onImportJson,
}: {
  projects: Project[];
  busy: string;
  onOpen: (id: string) => void;
  onDelete: (project: Project) => void;
  onImportJson: (file: File) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All artifacts');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [subjectFilter, setSubjectFilter] = useState('All subjects');

  const subjects = useMemo(
    () => Array.from(new Set(projects.map((p) => p.settings.subject))),
    [projects],
  );

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (q && !p.title.toLowerCase().includes(q)) return false;
      if (filter !== 'All artifacts' && !p.kinds.includes(filter as Kind))
        return false;
      if (
        subjectFilter !== 'All subjects' &&
        p.settings.subject !== subjectFilter
      )
        return false;
      if (statusFilter === 'No artifacts' && p.artifact_count > 0) return false;
      if (
        statusFilter === 'Needs review' &&
        !(p.reviewed_count < p.artifact_count)
      )
        return false;
      if (
        statusFilter === 'Reviewed' &&
        !(p.artifact_count > 0 && p.reviewed_count === p.artifact_count)
      )
        return false;
      return true;
    });
  }, [projects, query, filter, subjectFilter, statusFilter]);

  return (
    <>
      <div className="toolbar">
        <label>
          Search
          <input
            placeholder="Search lesson titles"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Artifact type
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>All artifacts</option>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {['All statuses', 'Needs review', 'Reviewed', 'No artifacts'].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Subject
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
          >
            <option>All subjects</option>
            {subjects.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="button secondary file-button toolbar-import">
          Import JSON backup
          <input
            type="file"
            accept=".json,application/json"
            disabled={!!busy}
            onChange={(e) => {
              if (e.target.files?.[0]) {
                onImportJson(e.target.files[0]);
              }
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <div className="library-grid">
        {filteredProjects.map((p, idx) => (
          <LibraryCard
            key={p.id}
            p={p}
            index={idx}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </div>
      {!projects.length && (
        <Empty title="Your library starts here.">
          Create a project in Content studio to save your first source, or
          import a saved Lessonly JSON file.
        </Empty>
      )}
    </>
  );
}
