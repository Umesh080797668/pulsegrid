'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiBase, authenticatedFetch } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';

type EventPayload = {
  id: string;
  tenant_id?: string;
  event_type?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
};

type Flow = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  run_count: number;
};

export default function EventsPage() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [events, setEvents] = useState<EventPayload[]>([]);
  const [replayLoading, setReplayLoading] = useState<string | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedFlowForReplay, setSelectedFlowForReplay] = useState<string>('');
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [selectedEventForReplay, setSelectedEventForReplay] = useState<EventPayload | null>(null);

  useEffect(() => {
    void loadFlows();
  }, [accessToken, workspaceId]);

  const loadFlows = async () => {
    if (!accessToken || !workspaceId) {
      return;
    }
    try {
      const response = await authenticatedFetch(`${apiBase}/flows?workspaceId=${workspaceId}`, accessToken, setAccessToken);
      if (response.ok) {
        setFlows((await response.json()) as Flow[]);
      }
    } catch (error) {
      console.error('Failed to load flows:', error);
    }
  };

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

  const handleReplayEvent = async (event: EventPayload, flowId?: string) => {
    if (!flowId) {
      alert('Please select a flow to replay this event through');
      return;
    }

    setReplayLoading(event.id);
    try {
      const response = await fetch(`${apiBase}/flows/${flowId}/replay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          eventPayload: event,
          workspaceId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to replay event');
      }

      alert('Event replayed successfully');
      setShowReplayModal(false);
      setSelectedFlowForReplay('');
      setSelectedEventForReplay(null);
    } catch (error) {
      console.error('Error replaying event:', error);
      alert('Failed to replay event');
    } finally {
      setReplayLoading(null);
    }
  };

  const openReplayModal = (event: EventPayload) => {
    setSelectedEventForReplay(event);
    setSelectedFlowForReplay('');
    setShowReplayModal(true);
  };

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
            <thead><tr><th>Type</th><th>Event ID</th><th>Tenant</th><th>Timestamp</th><th>Action</th></tr></thead>
            <tbody>
              {events.map((evt) => (
                <tr key={evt.id}>
                  <td><span className="badge b-accent">{evt.event_type || 'event'}</span></td>
                  <td><span className="font-mono text-faint" style={{ fontSize: 11 }}>{evt.id.slice(0, 16)}…</span></td>
                  <td>{evt.tenant_id?.slice(0, 12) || '—'}</td>
                  <td>{evt.timestamp || '—'}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => openReplayModal(evt)}
                      disabled={replayLoading === evt.id}
                      style={{ fontSize: 11 }}
                    >
                      {replayLoading === evt.id ? 'Replaying...' : 'Replay'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showReplayModal && selectedEventForReplay && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 600 }}>
              Replay Event
            </h2>
            <p style={{ color: '#666', marginBottom: '16px' }}>
              Select a flow to replay this event through with the current flow definition.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                Flow
              </label>
              <select
                value={selectedFlowForReplay}
                onChange={(e) => setSelectedFlowForReplay(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                <option value="">-- Select a flow --</option>
                {flows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.name}
                  </option>
                ))}
              </select>
              {flows.length === 0 && (
                <p style={{ color: '#999', fontSize: '12px', marginTop: '8px' }}>
                  No flows available. Create a flow first.
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowReplayModal(false);
                  setSelectedFlowForReplay('');
                  setSelectedEventForReplay(null);
                }}
                disabled={replayLoading !== null}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (selectedFlowForReplay) {
                    handleReplayEvent(selectedEventForReplay, selectedFlowForReplay);
                  }
                }}
                disabled={!selectedFlowForReplay || replayLoading !== null}
              >
                {replayLoading ? 'Replaying...' : 'Replay Event'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
