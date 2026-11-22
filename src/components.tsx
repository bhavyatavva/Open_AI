import { useEffect, useRef, type ReactNode } from 'react';
import type { Artifact, Source } from './types.ts';

export function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      ✦
    </span>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}

export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Mark />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const prevActive = document.activeElement as HTMLElement | null;
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog.open) {
        dialog.close();
      }
      prevActive?.focus?.();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          onCloseRef.current();
        }
      }}
      aria-labelledby="dialog-title"
    >
      <header className="dialog-heading">
        <h2 id="dialog-title">{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function ArtifactView({
  artifact,
  source,
}: {
  artifact: Artifact;
  source: Source[];
}) {
  const d = artifact.data;
  return (
    <article className="document">
      <div className="document-kicker">
        {artifact.kind} ·{' '}
        {artifact.reviewed ? 'Educator reviewed' : 'Needs educator review'}
      </div>
      <h1>{d.title}</h1>
      <h2>Learning objectives</h2>
      <ul>
        {d.objectives.map((o, i) => (
          <li key={i}>{o}</li>
        ))}
      </ul>
      {d.sections.map((s, i) => (
        <section key={i}>
          <h2>{s.heading}</h2>
          <p className="preserve">{s.body}</p>
          <div className="grounding">
            <Badge>{s.grounding}</Badge>
            {s.source_ids.map((id) => (
              <details key={id}>
                <summary>{id}</summary>
                <p>
                  {source.find((x) => x.id === id)?.text ||
                    'Source passage unavailable'}
                </p>
              </details>
            ))}
          </div>
        </section>
      ))}
      {d.flashcards.length > 0 && (
        <section>
          <h2>Flashcard deck · {d.flashcards.length} cards</h2>
          <div className="flashcard-grid">
            {d.flashcards.map((c, i) => (
              <details className="flashcard" key={i}>
                <summary>{c.front}</summary>
                <p>{c.back}</p>
                <small>{c.tags.join(' · ')}</small>
              </details>
            ))}
          </div>
        </section>
      )}
      {d.quality_flags.length > 0 && (
        <aside className="notice">
          <strong>Review notes</strong>
          <ul>
            {d.quality_flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  );
}
