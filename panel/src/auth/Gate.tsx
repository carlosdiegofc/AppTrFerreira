import { type FormEvent, type ReactNode, useState } from 'react';
import { Outlet } from 'react-router';
import logo from '../assets/logo-tr.png';
import { useAuth } from './AuthProvider';

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="login">
      <div className="login-card">
        <img src={logo} alt="TR Ferreira" className="login-logo" />
        {children}
      </div>
    </div>
  );
}

function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await signIn(email, password);
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <Frame>
      <h1>Panel de gestión</h1>
      <p className="login-sub">Ingresá con tu cuenta de Transportes Ferreira.</p>
      <form onSubmit={(e) => void submit(e)} className="login-form">
        <label>
          Correo
          <input type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Contraseña
          <input type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
      <p className="login-note">Es la misma cuenta que usás en la app.</p>
    </Frame>
  );
}

/** Shows the panel only to accounts the database lets read the whole fleet. */
export function Gate() {
  const { state, signOut, retry } = useAuth();
  switch (state.status) {
    case 'loading':
    case 'checking':
      return (
        <Frame>
          <p className="login-sub" aria-busy="true">
            Cargando…
          </p>
        </Frame>
      );
    case 'signedOut':
      return <Login />;
    case 'denied':
      return (
        <Frame>
          <h1>Esta cuenta no tiene acceso</h1>
          <p className="login-sub">
            El panel es para la administración de la empresa. Ingresaste como <strong>{state.user.email}</strong>.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void signOut()}>
            Ingresar con otra cuenta
          </button>
        </Frame>
      );
    case 'offline':
      return (
        <Frame>
          <h1>No se pudo conectar</h1>
          <p className="login-sub">Revisá la conexión a internet y probá de nuevo.</p>
          <div className="login-actions">
            <button type="button" className="btn btn-primary" onClick={retry}>
              Reintentar
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
              Salir
            </button>
          </div>
        </Frame>
      );
    case 'ready':
      return <Outlet />;
  }
}
