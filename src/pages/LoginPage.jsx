import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';

export function LoginPage() {
  const { currentUser, loginUser, registerUser, logoutUser } = useOutletContext();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    const action = mode === 'login' ? loginUser : registerUser;
    const result = await action(email, password);
    if (!result.ok) {
      const rawMessage = result.message || 'Unable to continue.';
      if (rawMessage.toLowerCase().includes('rate limit')) {
        setMessage('Too many signup attempts. Please wait a bit, or use Login if you already registered.');
      } else {
        setMessage(rawMessage);
      }
      return;
    }

    setPassword('');
    if (result.message) {
      setMessage(result.message);
      return;
    }
    navigate('/');
  };

  if (currentUser) {
    return (
      <section className="auth-page">
        <article className="panel auth-page-panel">
          <div className="section-heading">
            <p className="eyebrow">Account</p>
            <h4>Signed in</h4>
          </div>
          <p className="muted">You are signed in as <strong>{currentUser}</strong>.</p>
          <div className="auth-actions">
            <button type="button" className="mini-button" onClick={() => navigate('/')}>Go to dashboard</button>
            <button type="button" className="btn" onClick={logoutUser}>Logout</button>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="auth-page">
      <article className="panel auth-page-panel">
        <div className="section-heading">
          <p className="eyebrow">Members</p>
          <h4>Login or create an account</h4>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-tabs">
            <button
              type="button"
              className={`mini-button${mode === 'login' ? ' active' : ''}`}
              onClick={() => setMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={`mini-button${mode === 'register' ? ' active' : ''}`}
              onClick={() => setMode('register')}
            >
              Register
            </button>
          </div>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="studio@musiclab.com"
              required
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              required
            />
          </label>
          {message ? <p className="auth-message">{message}</p> : null}
          <button type="submit" className="btn">
            {mode === 'login' ? 'Login' : 'Create account'}
          </button>
        </form>
      </article>
    </section>
  );
}
