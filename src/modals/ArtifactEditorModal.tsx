import { ArtifactView, Modal } from '../components.tsx';
import type { Artifact, Kind, Project } from '../types.ts';

export default function ArtifactEditorModal({
  editor,
  project,
  view,
  discardConfirm,
  busy,
  active,
  aiReady,
  error,
  onSetView,
  onSetDiscardConfirm,
  onClose,
  onCopy,
  onRegenerate,
  onChangeEditor,
  onSave,
}: {
  editor: Artifact;
  project: Project;
  view: 'preview' | 'edit';
  discardConfirm: boolean;
  busy: string;
  active: boolean;
  aiReady: boolean;
  error: string;
  onSetView: (view: 'preview' | 'edit') => void;
  onSetDiscardConfirm: (v: boolean) => void;
  onClose: () => void;
  onCopy: () => void;
  onRegenerate: (kind: Kind) => void;
  onChangeEditor: (next: Artifact) => void;
  onSave: (reviewed: boolean) => void;
}) {
  function updateSection(
    index: number,
    field: 'body' | 'heading',
    value: string,
  ) {
    onChangeEditor({
      ...editor,
      data: {
        ...editor.data,
        sections: editor.data.sections.map((s, i) =>
          i === index ? { ...s, [field]: value } : s,
        ),
      },
    });
  }

  return (
    <Modal
      title={editor.kind}
      onClose={() => {
        if (view !== 'edit') {
          onClose();
        } else {
          onSetDiscardConfirm(true);
        }
      }}
    >
      <div className="editor-toolbar">
        <button
          type="button"
          className={view === 'preview' ? 'primary' : 'secondary'}
          onClick={() => {
            onSetView('preview');
            onSetDiscardConfirm(false);
          }}
        >
          Preview
        </button>
        <button
          type="button"
          className={view === 'edit' ? 'primary' : 'secondary'}
          onClick={() => onSetView('edit')}
        >
          Edit
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!!busy}
          onClick={onCopy}
        >
          Copy
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!!busy || active || !aiReady}
          onClick={() => onRegenerate(editor.kind)}
        >
          Generate new version
        </button>
      </div>
      {discardConfirm && (
        <div className="discard-confirm" role="alert">
          <span>Discard unsaved edits?</span>
          <div>
            <button
              type="button"
              className="secondary"
              onClick={() => onSetDiscardConfirm(false)}
            >
              Keep editing
            </button>
            <button type="button" className="danger" onClick={onClose}>
              Discard edits
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {view === 'preview' ? (
        <ArtifactView artifact={editor} source={project.source} />
      ) : (
        <div className="editor-fields">
          <label>
            Title
            <input
              value={editor.data.title}
              maxLength={200}
              onChange={(e) =>
                onChangeEditor({
                  ...editor,
                  data: { ...editor.data, title: e.target.value },
                })
              }
            />
          </label>
          <label>
            Objectives (one per line)
            <textarea
              value={editor.data.objectives.join('\n')}
              onChange={(e) =>
                onChangeEditor({
                  ...editor,
                  data: {
                    ...editor.data,
                    objectives: e.target.value.split('\n'),
                  },
                })
              }
            />
          </label>
          {editor.data.sections.map((s, i) => (
            <section key={i}>
              <label>
                Section {i + 1} heading
                <input
                  value={s.heading}
                  onChange={(e) => updateSection(i, 'heading', e.target.value)}
                />
              </label>
              <label>
                Section content
                <textarea
                  className="section-editor"
                  value={s.body}
                  onChange={(e) => updateSection(i, 'body', e.target.value)}
                />
              </label>
            </section>
          ))}
          {editor.data.flashcards.map((c, i) => (
            <div className="field-grid" key={i}>
              {(['front', 'back'] as const).map((key) => (
                <label key={key}>
                  Card {i + 1} {key}
                  <textarea
                    value={c[key]}
                    onChange={(e) =>
                      onChangeEditor({
                        ...editor,
                        data: {
                          ...editor.data,
                          flashcards: editor.data.flashcards.map((x, j) =>
                            i === j ? { ...x, [key]: e.target.value } : x,
                          ),
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="editor-actions">
        <span className="muted">
          Revision {editor.revision} ·{' '}
          {editor.reviewed ? 'Reviewed' : 'Review required'}
        </span>
        <button
          type="button"
          disabled={!!busy}
          className="secondary"
          onClick={() => onSave(true)}
        >
          Mark reviewed
        </button>
        <button
          type="button"
          disabled={!!busy}
          className="primary"
          onClick={() => onSave(false)}
        >
          Save edits
        </button>
      </div>
    </Modal>
  );
}
