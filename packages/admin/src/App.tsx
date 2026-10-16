import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { api, setUnauthorizedHandler } from './api/client';
import { useServerStatus } from './api/ws';
import { LayoutsPage } from './pages/LayoutsPage';
import { EditorPage } from './pages/EditorPage';
import { CamerasPage } from './pages/CamerasPage';
import { MediaPage } from './pages/MediaPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const [auth, setAuth] = useState<'checking' | 'ok' | 'login'>('checking');
  const { connected } = useServerStatus();

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth('login'));
    api.auth
      .status()
      .then((s) => setAuth(s.enabled && !s.authenticated ? 'login' : 'ok'))
      .catch(() => setAuth('ok'));
  }, []);

  if (auth === 'checking') return <div className="page">Loading…</div>;
  if (auth === 'login') return <LoginPage onLoggedIn={() => setAuth('ok')} />;

  return (
    <div className="app">
      <nav className="nav">
        <span className="brand">📺 piMarquee</span>
        <NavLink to="/" end>
          Layouts
        </NavLink>
        <NavLink to="/cameras">Cameras</NavLink>
        <NavLink to="/media">Media</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <span className="spacer" />
        <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? 'Connected to server' : 'Disconnected'} />
        <a href="/display/" target="_blank" rel="noreferrer" className="small">
          Open display ↗
        </a>
      </nav>
      <Routes>
        <Route path="/" element={<LayoutsPage />} />
        <Route path="/layouts/:id" element={<EditorPage />} />
        <Route path="/cameras" element={<CamerasPage />} />
        <Route path="/media" element={<MediaPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<LayoutsPage />} />
      </Routes>
    </div>
  );
}
