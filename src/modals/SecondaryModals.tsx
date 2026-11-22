import { Badge, Modal } from '../components.tsx';
import type { Project } from '../types.ts';

export function PasteModal({
  title,
  text,
  busy,
  error,
  onTitleChange,
  onTextChange,
  onSubmit,
  onClose,
}: {
  title: string;
  text: string;
  busy: string;
  error: string;
  onTitleChange: (v: string) => void;
  onTextChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Start with your notes" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label>
          Lesson title
          <input
            value={title}
            maxLength={180}
            required
            onChange={(e) => onTitleChange(e.target.value)}
          />
        </label>
        <label>
          Teaching material
          <textarea
            className="paste-area"
            value={text}
            minLength={40}
            maxLength={100000}
            required
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Paste Markdown or plain text here…"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={!!busy}>
          Save source
        </button>
      </form>
    </Modal>
  );
}

export function SourceModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  return (
    <Modal title="Source passages" onClose={onClose}>
      <p className="muted">
        These passages are the reference material for this project.
      </p>
      {project.source.map((s) => (
        <section className="source-passage" key={s.id}>
          <Badge>
            {s.id}
            {s.page ? ` · page ${s.page}` : ''}
          </Badge>
          <p className="preserve">{s.text}</p>
        </section>
      ))}
    </Modal>
  );
}

export function ConfirmDeleteModal({
  project,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  project: Project;
  busy: string;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Delete this project?" onClose={onClose}>
      <p>
        “{project.title}” and its sources, artifacts, and generation history
        will be permanently removed.
      </p>
      <button
        type="button"
        className="danger"
        disabled={!!busy}
        onClick={onConfirm}
      >
        Delete project
      </button>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

export function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Your source material" onClose={onClose}>
      <p>
        Source text, account details, and generated artifacts are stored in your
        workspace database (or browser storage in offline file mode). Raw upload
        files are discarded after extraction. Server-side generation sends
        extracted text and your learning profile to Google Gemini without
        exposing API credentials to the browser.
      </p>
      <p>
        Your projects are accessible only to your account through the app. You
        can download a self-contained offline HTML copy, standalone kit reader,
        PNG summary image, or JSON backup anytime to inspect, edit, and export
        kits locally via File Explorer.
      </p>
      <p>
        Grounding labels describe the model’s assessment of source support. They
        are not independent factual verification. Review materials before
        sharing them with learners.
      </p>
    </Modal>
  );
}
