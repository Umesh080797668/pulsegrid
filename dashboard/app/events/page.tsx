'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiBase } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';

type EventPayload = {
  id: string;
  tenant_id?: string;
  event_type?: string;
  timestamp?: string;
};

export default function EventsPage() {
  const { accessToken, workspaceId } = useDashboardStore();
  const [events, setEvents] = useState<EventPayload[]>([]);

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
    if (!workspaceId || !accessToken) {
      return;
    }

    socket = io(wsUrl, { transports: ['websocket'], auth: { token: `Bearer ${accessToken}` } });
    socket.on('connect', () => socket?.emit('join_workspace', { workspaceId }));
    socket.on('workspace_event', (payload: EventPayload) => setEvents((prev) => [payload, ...prev].slice(0, 150)));

    return () => {
      if (socket) {
        socket.emit('leave_workspace', { workspaceId });
        socket.disconnect();
      }
    };
  }, [workspaceId, accessToken, wsUrl]);

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">Live Events</div>
          <div className="page-sub">room: workspace:{workspaceId?.slice(0, 12) || '—'}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setEvents([])}>Clear</button>
        </div>
      </div>

      <div className="card">
        {events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">Listening for events…</div>
            <div className="empty-sub">Workspace events will stream here in real time.</div>
          </div>
        ) : (
          <table>
            <thead><tr><th>Type</th><th>Event ID</th><th>Tenant</th><th>Timestamp</th></tr></thead>
            <tbody>
              {events.map((evt) => (
                <tr key={evt.id}>
                  <td><span className="badge b-accent">{evt.event_type || 'event'}</span></td>
                  <td><span className="font-mono text-faint" style={{ fontSize: 11 }}>{evt.id.slice(0, 16)}…</span></td>
                  <td>{evt.tenant_id?.slice(0, 12) || '—'}</td>
                  <td>{evt.timestamp || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
