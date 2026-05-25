import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { navigationItems } from '../data/siteContent';
import { supabase } from '../lib/supabaseClient';

export function Layout() {
  const [showBrand, setShowBrand] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    function onScroll() {
      setShowBrand(window.scrollY < 24);
    }

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setCurrentUser(data.session?.user?.email || null);
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user?.email || null);
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
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        {showBrand ? (
          <div className="brand-block">
            <div className="brand-mark">MLH</div>
            <div>
              <p className="eyebrow">Graduation project</p>
              <h1>Music Lab Hub</h1>
            </div>
          </div>
        ) : (
          <div className="brand-spacer" aria-hidden="true" />
        )}

        <div className="sidebar-auth">
          <NavLink to={currentUser ? '/account' : '/login'} className="mini-button">
            {currentUser ? 'Account' : 'Login'}
          </NavLink>
        </div>

        <nav className="nav-list" aria-label="Site navigation">
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
            <p className="eyebrow">Vite + React + music systems</p>
            <h2>One interface, nine music modules, and a clean thesis story.</h2>
          </div>
          <div className="topbar-chip">Ready for prototyping</div>
        </header>

        <section className="page-root">
          <Outlet context={{ currentUser, loginUser, registerUser, logoutUser }} />
        </section>
      </main>
    </div>
  );
}
