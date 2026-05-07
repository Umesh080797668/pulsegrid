'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { apiBase } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';

type AuthMode = 'login' | 'register';

type AuthScreenProps = {
  initialMode?: AuthMode;
  redirectTo?: string;
};

export function AuthScreen({ initialMode = 'login', redirectTo = '/flows' }: AuthScreenProps) {
  const router = useRouter();
  const { accessToken, setAccessToken } = useDashboardStore();
  const [authMode, setAuthMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setAuthMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (accessToken) {
      router.replace(redirectTo);
    }
  }, [accessToken, redirectTo, router]);

  const onSubmit = async () => {
    setMessage('');
    if (!email || !password) {
      setMessage('Email and password are required');
      return;
    }

    const endpoint = authMode === 'register' ? '/auth/register' : '/auth/login';
    const payload = authMode === 'register' ? { email, password, name: name || undefined } : { email, password };
    const response = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => ({}))) as { message?: string; accessToken?: string };

    if (!response.ok) {
      setMessage(data.message || `Authentication failed (${response.status})`);
      return;
    }

    if (authMode === 'register') {
      setAuthMode('login');
      setPassword('');
      setMessage(data.message || 'Account created. Please sign in.');
      return;
    }

    if (!data.accessToken) {
      setMessage('Authentication succeeded but token missing');
      return;
    }

    setAccessToken(data.accessToken);
    router.replace(redirectTo);
  };

  return (
    <div className="auth-screen">
      <div className="auth-bg" />
      <div className="auth-grid" />
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon"><Zap size={20} /></div>
          <span className="auth-logo-text">PulseGrid</span>
          <div className="auth-tagline">Automation infrastructure for modern teams</div>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab${authMode === 'login' ? ' active' : ''}`} onClick={() => setAuthMode('login')}>Sign in</button>
          <button className={`auth-tab${authMode === 'register' ? ' active' : ''}`} onClick={() => setAuthMode('register')}>Create account</button>
        </div>

        <div className="auth-form-stack">
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {authMode === 'register' && (
            <div className="form-group">
              <label className="form-label">Display name</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
        </div>

        {message && (
          <div className={`alert ${message.includes('failed') || message.includes('required') ? 'alert-error' : 'alert-success'}`}>
            {message}
          </div>
        )}

        <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={onSubmit}>
          {authMode === 'register' ? 'Create account' : 'Sign in to PulseGrid'}
        </button>

        <div className="auth-footnote">
          {authMode === 'register' ? (
            <>
              Already have an account? <Link href="/login">Sign in</Link>
            </>
          ) : (
            <>
              Need an account? <Link href="/register">Create one</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
