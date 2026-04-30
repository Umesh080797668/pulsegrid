'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiBase, authenticatedFetch } from '../../../lib/api';
import { useDashboardStore } from '../../../lib/store';

export default function NewFlowPage() {
  const router = useRouter();
  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState<any>(null);

  const generate = async () => {
    if (!accessToken) return;
    setError('');
    setLoading(true);
    try {
      const resp = await authenticatedFetch(`${apiBase}/ai/generate-flow`, accessToken, setAccessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!resp.ok) {
        setError(`Generation failed (${resp.status})`);
        setLoading(false);
        return;
      }
      const data = await resp.json();
      // response shape may be { flow_json, success, error_message }
      const flowJson = data.flow_json ? JSON.parse(data.flow_json) : data;
      setGenerated(flowJson);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const saveFlow = async () => {
    if (!accessToken || !workspaceId || !generated) return;
    setLoading(true);
    try {
      const body = {
        workspaceId,
        name: (generated.name as string) || 'AI generated flow',
        description: (generated.description as string) || null,
        definition: generated,
      };
      const resp = await authenticatedFetch(`${apiBase}/flows`, accessToken, setAccessToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        setError(`Save failed (${resp.status})`);
        setLoading(false);
        return;
      }
      // navigate back to flows list
      router.push('/flows');
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-hd">
        <div>
          <div className="page-title">Describe Your Automation</div>
          <div className="page-sub">Write a short description and PulseAI will generate a Flow for you.</div>
        </div>
      </div>

      {error && <div className="alert alert-error mb-16">{error}</div>}

      <div className="card">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the automation you want (e.g. send Slack message when a new Shopify order contains 'refund')" style={{ width: '100%', minHeight: 120 }} />
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={generate} disabled={loading || !prompt}>Generate</button>
        </div>
      </div>

      {generated && (
        <div className="card mt-16">
          <div style={{ fontWeight: 700 }}>Generated Flow</div>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>{JSON.stringify(generated, null, 2)}</pre>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={saveFlow} disabled={loading}>Save Flow</button>
            <button className="btn btn-ghost ml-8" onClick={() => { setGenerated(null); }}>Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
