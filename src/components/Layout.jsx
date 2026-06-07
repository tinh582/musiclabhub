import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleProvider';
import { useSiteContent } from '../hooks/useSiteContent';
import { supabase } from '../lib/supabaseClient';

function getDisplayName(user) {
  if (!user) {
    return null;
  }

  const metadata = user.user_metadata || {};
  const candidate = metadata.full_name || metadata.name || metadata.display_name || metadata.preferred_name;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }

  return user.email ? user.email.split('@')[0] : null;
}

export function Layout() {
  const navigate = useNavigate();
  const { locale, setLocale, t } = useLocale();
  const { navigationItems } = useSiteContent();
  const [showBrand, setShowBrand] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserName, setCurrentUserName] = useState(null);
  const [workspaceAudio, setWorkspaceAudio] = useState(null);
  const [moduleHandoff, setModuleHandoff] = useState(null);
  const [analysisHistory, setAnalysisHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mlh_analysis_history') || '[]');
    } catch (error) {
      return [];
    }
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const workspaceUrlRef = useRef(null);

  const applySessionUser = (user) => {
    setCurrentUser(user?.email || null);
    setCurrentUserName(getDisplayName(user));
  };

  useEffect(() => {
    function onScroll() {
      setShowBrand(window.scrollY < 24);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => () => {
    if (workspaceUrlRef.current) URL.revokeObjectURL(workspaceUrlRef.current);
  }, []);

  const selectWorkspaceAudio = (file) => {
    if (!file) return;
    if (workspaceUrlRef.current) URL.revokeObjectURL(workspaceUrlRef.current);
    const url = URL.createObjectURL(file);
    workspaceUrlRef.current = url;
    setWorkspaceAudio({
      url,
      name: file.name,
      type: file.type,
      size: file.size,
      file,
    });
  };

  const clearWorkspaceAudio = () => {
    if (workspaceUrlRef.current) URL.revokeObjectURL(workspaceUrlRef.current);
    workspaceUrlRef.current = null;
    setWorkspaceAudio(null);
  };

  const sendModuleHandoff = (type, payload, source) => {
    setModuleHandoff({
      id: Date.now(),
      type,
      payload,
      source,
      createdAt: new Date().toISOString(),
    });
  };

  const clearModuleHandoff = () => setModuleHandoff(null);

  const saveAnalysis = (entry) => {
    const nextEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    setAnalysisHistory((current) => {
      const next = [nextEntry, ...current].slice(0, 40);
      localStorage.setItem('mlh_analysis_history', JSON.stringify(next));
      return next;
    });
  };

  const removeAnalysis = (id) => {
    setAnalysisHistory((current) => {
      const next = current.filter((entry) => entry.id !== id);
      localStorage.setItem('mlh_analysis_history', JSON.stringify(next));
      return next;
    });
  };

  const clearAnalysisHistory = () => {
    localStorage.removeItem('mlh_analysis_history');
    setAnalysisHistory([]);
  };

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        applySessionUser(data.session?.user || null);
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySessionUser(session?.user || null);
    });

    loadSession();
    return () => {
      mounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const loginUser = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { ok: false, message: error.message };
    }
    return { ok: true };
  };

  const registerUser = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return { ok: false, message: error.message };
    }
    if (!data.session) {
      return { ok: true, message: 'Check your email to confirm your account.' };
    }
    return { ok: true };
  };

  const logoutUser = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCurrentUserName(null);
  };

  const updateDisplayName = async (displayName) => {
    const nextName = displayName.trim();
    if (!nextName) {
      return { ok: false, message: t('account.nameRequired', 'Please enter a display name.') };
    }

    const { data, error } = await supabase.auth.updateUser({
      data: { full_name: nextName },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    setCurrentUserName(getDisplayName(data.user) || nextName);
    return { ok: true };
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        {showBrand ? (
          <div className="brand-block">
            <div className="brand-mark">MLH</div>
            <div>
              <p className="eyebrow">{t('layout.brandTag', 'Interactive music toolkit')}</p>
              <h1>{t('layout.appName', 'Music Lab Hub')}</h1>
            </div>
          </div>
        ) : (
          <div className="brand-spacer" aria-hidden="true" />
        )}

        <div className="sidebar-auth">
          <NavLink to={currentUser ? '/account' : '/login'} className="mini-button">
            {currentUser ? t('layout.account', 'Account') : t('layout.login', 'Login')}
          </NavLink>
        </div>

        <nav className="nav-list" aria-label={t('layout.nav.aria', 'Site navigation')}>
          {navigationItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              end={item.path === '/'}
            >
              <span>{item.label}</span>
              <span className="nav-arrow">↗</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t('layout.topbar.eyebrow', 'Vite + React + music systems')}</p>
            <h2>{t('layout.topbar.title', 'One interface, nine music modules, and a clean thesis story.')}</h2>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="mini-button workspace-upload">
              <span>{workspaceAudio ? 'Replace song' : 'Upload song'}</span>
              <input
                type="file"
                accept="audio/*"
                onChange={(event) => {
                  selectWorkspaceAudio(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
            {workspaceAudio ? (
              <>
                <span className="topbar-chip" title={workspaceAudio.name}>{workspaceAudio.name}</span>
                <button type="button" className="mini-button" onClick={clearWorkspaceAudio}>Clear</button>
              </>
            ) : null}
            {moduleHandoff ? (
              <span className="topbar-chip" title={`Sent from ${moduleHandoff.source}`}>
                Handoff: {moduleHandoff.type}
              </span>
            ) : null}
            <button type="button" className="mini-button" onClick={() => setHistoryOpen((open) => !open)}>
              History {analysisHistory.length ? `(${analysisHistory.length})` : ''}
            </button>
            <span className="topbar-chip">{t('layout.topbar.status', 'Ready for prototyping')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="eyebrow" style={{ margin: 0 }}>{t('layout.language', 'Language')}</span>
              <button
                type="button"
                className={`mini-button${locale === 'en' ? ' active' : ''}`}
                onClick={() => setLocale('en')}
              >
                {t('layout.language.en', 'English')}
              </button>
              <button
                type="button"
                className={`mini-button${locale === 'vi' ? ' active' : ''}`}
                onClick={() => setLocale('vi')}
              >
                {t('layout.language.vi', 'Vietnamese')}
              </button>
            </div>
          </div>
        </header>

        {historyOpen ? (
          <section className="history-drawer" aria-label="Analysis history">
            <div className="history-drawer__header">
              <div>
                <p className="eyebrow">Analysis history</p>
                <strong>Saved results</strong>
              </div>
              <div className="history-drawer__actions">
                <button type="button" className="mini-button" onClick={clearAnalysisHistory} disabled={!analysisHistory.length}>Clear all</button>
                <button type="button" className="mini-button" onClick={() => setHistoryOpen(false)}>Close</button>
              </div>
            </div>
            <div className="history-list">
              {analysisHistory.length ? analysisHistory.map((entry) => (
                <article key={entry.id} className="history-item">
                  <div>
                    <p className="eyebrow">{entry.module}</p>
                    <strong>{entry.title}</strong>
                    <span>{entry.source || 'Unknown source'}</span>
                    <small>{new Date(entry.createdAt).toLocaleString()}</small>
                  </div>
                  <div className="history-item__metrics">
                    {(entry.metrics || []).slice(0, 4).map((metric) => (
                      <span key={`${metric.label}-${metric.value}`}>{metric.label}: <strong>{metric.value}</strong></span>
                    ))}
                  </div>
                  <div className="history-item__actions">
                    <button type="button" className="mini-button" onClick={() => {
                      navigate(`/feature/${entry.slug}`);
                      setHistoryOpen(false);
                    }}>Open</button>
                    <button type="button" className="mini-button" onClick={() => removeAnalysis(entry.id)}>Remove</button>
                  </div>
                </article>
              )) : <p className="practice-note">No saved analyses yet.</p>}
            </div>
          </section>
        ) : null}

        <section className="page-root">
          <Outlet context={{
            currentUser,
            currentUserName,
            loginUser,
            registerUser,
            logoutUser,
            updateDisplayName,
            workspaceAudio,
            selectWorkspaceAudio,
            clearWorkspaceAudio,
            moduleHandoff,
            sendModuleHandoff,
            clearModuleHandoff,
            analysisHistory,
            saveAnalysis,
          }} />
        </section>
      </main>
    </div>
  );
}
