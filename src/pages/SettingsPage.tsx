import { useState } from 'react';
import { api } from '../api.ts';
import type { Me } from '../types.ts';

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        setBusy(true);
        try {
          await api('/auth/password', 'POST', data);
          onDone();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Change password</h3>
      <label>
        Current password
        <input
          name="current"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <label>
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="secondary" disabled={busy}>
        Change password and sign out
      </button>
    </form>
  );
}

export default function SettingsPage({
  me,
  offlineMode,
  busy,
  onRefreshMe,
  onSignedOut,
  onOpenLocalFiles,
  onDownloadStudio,
}: {
  me: Me;
  offlineMode: boolean;
  busy: string;
  onRefreshMe: () => void;
  onSignedOut: () => void;
  onOpenLocalFiles: () => void;
  onDownloadStudio: () => void;
}) {
  return (
    <div className="settings-grid">
      <div className="panel">
        <p className="eyebrow">ACCOUNT</p>
        <h2>{me.user.name}</h2>
        <p>{me.user.email}</p>
        <PasswordForm onDone={onSignedOut} />
      </div>
      <div className="panel">
        <p className="eyebrow">AI CONNECTION</p>
        <h2>
          {offlineMode
            ? 'Offline file mode'
            : me.ai_ready
              ? 'Configured'
              : 'Setup required'}
        </h2>
        <p>
          {offlineMode
            ? 'Running directly from File Explorer (file://) with browser-local storage.'
            : `Provider: Google Gemini · Model: ${me.model}`}
        </p>
        <p className="muted">
          {offlineMode
            ? 'All sources, edits, reviews, templates, insights, and exports work locally offline without a server.'
            : 'Keys are managed on the server and never sent to your browser. A configured connection requires valid model access and API billing.'}
        </p>
        {!offlineMode && (
          <button
            type="button"
            className="secondary"
            onClick={onRefreshMe}
          >
            Refresh connection status
          </button>
        )}
        <hr />
        <h3>Offline &amp; File Explorer access</h3>
        <p className="muted">
          Download standalone HTML pages, summary PNG images, JSON backups, or
          the full offline studio to open directly from your device’s File
          Explorer in any browser.
        </p>
        <div className="settings-actions">
          <button
            type="button"
            className="primary"
            disabled={!!busy}
            onClick={onDownloadStudio}
          >
            ↓ Download offline studio (.html)
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onOpenLocalFiles}
          >
            Open local files guide &amp; exports
          </button>
        </div>
        <hr />
        <h3>Account recovery</h3>
        <p className="muted">
          Contact your workspace administrator for a password reset. Registration
          is controlled by the workspace invitation code.
        </p>
      </div>
    </div>
  );
}
