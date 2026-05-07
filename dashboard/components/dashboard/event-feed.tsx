'use client';

import { useEffect, useState } from 'react';
import { apiBase, authenticatedFetch } from '../../lib/api';
import { useDashboardStore } from '../../lib/store';
import { Activity } from 'lucide-react';

export interface EventPayload {
  id: string;
  tenant_id?: string;
  event_type?: string;
  timestamp?: string;
}

export function EventFeed() {
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [events, setEvents] = useState<EventPayload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken || !workspaceId) return;

    const fetchEvents = async () => {
      try {
        setLoading(true);
        // Fetch recent events from workspace
        const response = await authenticatedFetch(
          `${apiBase}/events?workspaceId=${workspaceId}&limit=10`,
          accessToken,
          setAccessToken,
        );

        if (response.ok) {
          const data = (await response.json()) as { events?: EventPayload[] };
          setEvents(data.events?.slice(0, 5) || []);
        }
      } catch (err) {
        // Silently fail for event feed
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [accessToken, workspaceId, setAccessToken]);

  if (loading) return <div style={{ padding: '12px', color: 'var(--text-3)', fontSize: 13 }}>Loading event feed…</div>;

  if (events.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-3)' }}>
        <Activity size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
        <div style={{ fontSize: 13 }}>No recent events yet</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {events.map((event) => (
        <div key={event.id} style={{ padding: 8, borderRadius: 6, backgroundColor: 'var(--bg-2)', fontSize: 11, color: 'var(--text-2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 500, color: 'var(--accent)' }}>{event.event_type || 'event'}</span>
            <span style={{ color: 'var(--text-3)', fontSize: 10 }}>
              {event.timestamp ? new Date(event.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'now'}
            </span>
          </div>
          <div style={{ color: 'var(--text-3)', fontSize: 10 }}>ID: {event.id.slice(0, 12)}…</div>
        </div>
      ))}
    </div>
  );
}
