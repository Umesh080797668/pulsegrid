import { RecentRuns } from '../../components/dashboard/recent-runs';
import { EventFeed } from '../../components/dashboard/event-feed';
import { QuickStats } from '../../components/dashboard/quick-stats';
import { FlowHealth } from '../../components/dashboard/flow-health';

export default function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, color: 'var(--text-1)' }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Real-time overview of your workspace health and activity</p>
      </div>

      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-1)' }}>Quick Stats</h2>
        <QuickStats />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20 }}>
        <div className="card">
          <div style={{ marginBottom: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Recent Flow Runs</h3>
          </div>
          <RecentRuns />
        </div>

        <div className="card">
          <div style={{ marginBottom: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Event Feed</h3>
          </div>
          <EventFeed />
        </div>
      </div>

      <div className="card">
        <div style={{ marginBottom: 12, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Flow Health</h3>
        </div>
        <FlowHealth />
      </div>
    </div>
  );
}

