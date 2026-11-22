import { useEffect, useState } from 'react';
import { Badge, Modal } from '../components.tsx';
import type { Project } from '../types.ts';

export default function LocalFilesModal({
  project,
  busy,
  onClose,
  onDownloadStudio,
  onDownloadKitHtml,
  onDownloadPng,
  onDownloadFormat,
  onImportJson,
}: {
  project: Project | null;
  busy: string;
  onClose: () => void;
  onDownloadStudio: () => void;
  onDownloadKitHtml: (p: Project) => void;
  onDownloadPng: (p: Project) => void;
  onDownloadFormat: (p: Project, fmt: 'json' | 'md' | 'csv' | 'anki') => void;
  onImportJson: (file: File) => void;
}) {
  const [posterUrl, setPosterUrl] = useState<string>('');
  const [posterLoading, setPosterLoading] = useState(false);

  useEffect(() => {
    if (!project) {
      setPosterUrl('');
      return;
    }
    let cancelled = false;
    let objectUrl = '';
    setPosterLoading(true);

    import('../exports.ts')
      .then(({ renderProjectPosterBlob }) => renderProjectPosterBlob(project))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPosterUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPosterUrl('');
      })
      .finally(() => {
        if (!cancelled) setPosterLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [project]);

  const hasFlashcards = Boolean(
    project?.artifacts.some((a) => a.data.flashcards.length > 0),
  );

  return (
    <Modal title="Offline downloads & local viewing" onClose={onClose}>
      <div className="offline-guide">
        <p className="eyebrow">VIEW VIA FILE EXPLORER IN YOUR BROWSER</p>
        <ol className="steps-inline">
          <li>
            <strong>1. Download</strong> a file below to your device’s{' '}
            <code>Downloads</code> folder.
          </li>
          <li>
            <strong>2. Open File Explorer</strong> (Windows) or{' '}
            <strong>Finder</strong> (macOS) and locate the saved file.
          </li>
          <li>
            <strong>3. Double-click</strong> any <code>.html</code> or{' '}
            <code>.png</code> file to open and view it offline in your web
            browser (<code>file://</code>).
          </li>
        </ol>
      </div>

      <div className="download-grid">
        <section className="download-card">
          <Badge>FULL APP · HTML</Badge>
          <h3>Portable Teaching Studio</h3>
          <p className="muted">
            Self-contained offline Lessonly app containing your entire workspace,
            sources, and saved learning kits. Supports viewing, editing, review
            marking, and exports via <code>file://</code>.
          </p>
          <button
            type="button"
            className="primary"
            disabled={!!busy}
            onClick={onDownloadStudio}
          >
            ↓ Download offline studio (.html)
          </button>
        </section>

        <section className="download-card">
          <Badge>RESTORE · JSON</Badge>
          <h3>Open Saved Project File</h3>
          <p className="muted">
            Pick a previously downloaded <code>lessonly-*.json</code> file from
            your File Explorer to restore its sources, profile, and artifacts
            into this workspace.
          </p>
          <label className="button secondary file-button">
            Browse local JSON file
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
        </section>
      </div>

      {project ? (
        <section className="panel">
          <div className="panel-heading">
            <span className="eyebrow">ACTIVE PROJECT EXPORTS</span>
            <Badge>{project.title}</Badge>
          </div>
          <div className="download-grid">
            <div className="download-card">
              <Badge>READER WEBPAGE · HTML</Badge>
              <h3>Standalone Kit Reader</h3>
              <p className="muted">
                Formatted single-page HTML document with collapsible source
                passages and interactive flashcards.
              </p>
              <button
                type="button"
                className="secondary"
                disabled={!!busy}
                onClick={() => onDownloadKitHtml(project)}
              >
                ↓ Download kit reader (.html)
              </button>
            </div>

            <div className="download-card">
              <Badge>IMAGE POSTER · PNG</Badge>
              <h3>Visual Summary Card</h3>
              <p className="muted">
                High-resolution PNG poster summarizing objectives, artifacts,
                and cited source passages for offline viewing.
              </p>
              <button
                type="button"
                className="secondary"
                disabled={!!busy}
                onClick={() => onDownloadPng(project)}
              >
                ↓ Download summary image (.png)
              </button>
            </div>
          </div>

          {(posterLoading || posterUrl) && (
            <div className="poster-preview">
              <small>Summary image preview (1600 × 1040 PNG)</small>
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt={`Visual summary card for ${project.title}`}
                  width={1600}
                  height={1040}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="poster-skeleton" aria-hidden="true" />
              )}
            </div>
          )}

          <div className="export-actions local-extra-exports">
            <button
              type="button"
              className="secondary"
              onClick={() => onDownloadFormat(project, 'md')}
            >
              ↓ Markdown (.md)
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onDownloadFormat(project, 'json')}
            >
              ↓ JSON archive (.json)
            </button>
            {hasFlashcards && (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onDownloadFormat(project, 'csv')}
                >
                  ↓ CSV flashcards (.csv)
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onDownloadFormat(project, 'anki')}
                >
                  ↓ Anki deck (.tsv)
                </button>
              </>
            )}
          </div>
        </section>
      ) : (
        <p className="muted">
          Select or create a lesson in <strong>Content studio</strong> to also
          export a standalone Kit Reader HTML, Summary PNG image, Markdown, or
          flashcard files for that lesson.
        </p>
      )}
    </Modal>
  );
}
