import { useState } from 'react';
import { api } from '../api/client';

export function LoginPage({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="login">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          api.auth
            .login(password)
            .then(() => onLoggedIn())
            .catch((er) => setError((er as Error).message))
            .finally(() => setBusy(false));
        }}
      >
        <h2>piMarquee</h2>
        <label className="field">
          <span className="field-label">Admin password</span>
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error-bar">{error}</div>}
        <button className="primary" type="submit" disabled={busy || !password}>
          Sign in
        </button>
      </form>
    </div>
  );
}
