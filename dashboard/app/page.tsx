'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Flow = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  run_count: number;
};

type EventPayload = {
  id: string;
  tenant_id?: string;
  event_type?: string;
  timestamp?: string;
  data?: unknown;
};

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000';

export default function HomePage() {
  const [token, setToken] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [flows, setFlows] = useState<Flow[]>([]);
  const [events, setEvents] = useState<EventPayload[]>([]);
  const [error, setError] = useState('');

  const wsUrl = useMemo(() => {
    try {
      const u = new URL(apiBase);
      return `${u.protocol}//${u.host}/events`;
    } catch {
      return 'http://127.0.0.1:3000/events';
    }
  }, []);

  useEffect(() => {
    let socket: Socket | null = null;
    if (!workspaceId) return;

    socket = io(wsUrl, { transports: ['websocket'] });
    socket.on('connect', () => {
      socket?.emit('join_workspace', { workspaceId });
    });
    socket.on('workspace_event', (payload: EventPayload) => {
      setEvents((prev) => [payload, ...prev].slice(0, 100));
    });

    return () => {
      if (socket) {
        socket.emit('leave_workspace', { workspaceId });
        socket.disconnect();
      }
    };
  }, [workspaceId, wsUrl]);

  async function loadFlows() {
    setError('');
    if (!workspaceId || !token) {
      setError('workspaceId and JWT token are required');
      return;
    }

    const res = await fetch(`${apiBase}/flows?workspaceId=${workspaceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      setError(`Failed to load flows (${res.status})`);
      return;
    }

    const data = (await res.json()) as Flow[];
    setFlows(data);
  }

  return (
    <main>
      <h1>PulseGrid Dashboard</h1>
      <p className="muted">Phase 1 MVP: flow list + live workspace event feed</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            style={{ minWidth: 360 }}
            placeholder="Workspace UUID"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          />
          <input
            style={{ minWidth: 360 }}
            placeholder="JWT access token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button onClick={loadFlows}>Load Flows</button>
        </div>
        {error ? <p style={{ color: '#ff8f8f' }}>{error}</p> : null}
      </div>

      <div className="grid">
        <section className="panel">
          <h2>Flows</h2>
          <small>{flows.length} loaded</small>
          <ul>
            {flows.map((flow) => (
              <li key={flow.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{flow.name}</strong>
                  <span className="muted">{flow.enabled ? 'enabled' : 'disabled'}</span>
                </div>
                <div className="muted">runs: {flow.run_count}</div>
                {flow.description ? <div>{flow.description}</div> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Live Events</h2>
          <small>via websocket room workspace:{workspaceId || '...'}</small>
          <ul>
            {events.map((evt) => (
              <li key={evt.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{evt.event_type || 'event'}</strong>
                  <span className="muted">{evt.timestamp || ''}</span>
                </div>
                <div className="muted">id: {evt.id}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
