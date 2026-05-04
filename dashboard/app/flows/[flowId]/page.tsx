'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FlowCanvas } from '../../../components/flow-canvas';
import { apiBase, authenticatedFetch } from '../../../lib/api';
import { useDashboardStore } from '../../../lib/store';
import { detectCircularSubFlowReferences, type FlowRecord } from '../../../lib/flow-subflows';

type ConnectorCatalogItem = {
  connector: string;
  action: string;
  category: string;
  auth: 'none' | 'bearer' | 'api_key' | 'oauth2' | 'mixed';
  required_input_fields: string[];
  optional_input_fields: string[];
};

type FlowResponse = FlowRecord & {
  enabled: boolean;
  run_count: number;
  workspace_id: string;
};

export default function FlowEditorPage() {
  const params = useParams<{ flowId: string | string[] }>();
  const router = useRouter();
  const flowId = useMemo(() => {
    const value = params?.flowId;
    return Array.isArray(value) ? value[0] : value || '';
  }, [params]);

  const { accessToken, workspaceId, setAccessToken } = useDashboardStore();
  const [flow, setFlow] = useState<FlowResponse | null>(null);
  const [workspaceFlows, setWorkspaceFlows] = useState<FlowRecord[]>([]);
  const [catalog, setCatalog] = useState<ConnectorCatalogItem[]>([]);
  const [definitionJson, setDefinitionJson] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken || !workspaceId || !flowId) {
      return;
    }

    const load = async () => {
      const [flowResp, listResp, catalogResp] = await Promise.all([
        authenticatedFetch(`${apiBase}/flows/${flowId}`, accessToken, setAccessToken),
        authenticatedFetch(`${apiBase}/flows`, accessToken, setAccessToken),
        authenticatedFetch(`${apiBase}/connectors/catalog`, accessToken, setAccessToken),
      ]);

      if (!flowResp.ok) {
        setError(`Failed to load flow (${flowResp.status})`);
        return;
      }

      if (!listResp.ok) {
        setError(`Failed to load workspace flows (${listResp.status})`);
        return;
      }

      const flowData = (await flowResp.json()) as FlowResponse;
      const listData = (await listResp.json()) as FlowRecord[];
      const catalogData = catalogResp.ok ? (await catalogResp.json()) as { items?: ConnectorCatalogItem[] } : { items: [] };

      setFlow(flowData);
      setWorkspaceFlows(listData || []);
      setCatalog(catalogData.items || []);
      setDefinitionJson(JSON.stringify(flowData.definition || {}, null, 2));
      setName(flowData.name || flowData.definition?.name || 'Untitled flow');
      setDescription(flowData.description || flowData.definition?.description || '');
      setPublished(Boolean(flowData.definition?.published));
      setError('');
    };

    void load();
  }, [accessToken, flowId, setAccessToken, workspaceId]);

  const reusableLibrary = useMemo(
    () => workspaceFlows.filter((item) => item.id !== flowId),
    [flowId, workspaceFlows],
  );

  const saveFlow = async () => {
    if (!flow || !workspaceId) {
      return;
    }

    setError('');
    setSaving(true);

    try {
      const candidateDefinition = JSON.parse(definitionJson) as FlowRecord['definition'];
      const mergedDefinition = {
        ...candidateDefinition,
        id: flow.id,
        name,
        description: description || undefined,
        published,
      };

      const validationErrors = detectCircularSubFlowReferences(
        mergedDefinition,
        flow.id,
        workspaceFlows,
      );

      if (validationErrors.length > 0) {
        setError(validationErrors.join(' '));
        return;
      }

      const response = await authenticatedFetch(`${apiBase}/flows/${flow.id}`, accessToken, setAccessToken, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          definition: mergedDefinition,
          enabled: flow.enabled,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.message || payload.error || `Failed to save flow (${response.status})`);
        return;
      }

      const saved = (await response.json()) as { data?: FlowResponse };
      if (saved.data) {
        setFlow(saved.data);
        setDefinitionJson(JSON.stringify(saved.data.definition || mergedDefinition, null, 2));
        setPublished(Boolean(saved.data.definition?.published));
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (!flowId) {
    return <div className="alert alert-error">Missing flow id.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-hd">
        <div>
          <div className="page-title">Flow editor</div>
          <div className="page-sub">Edit the flow, publish reusable sub-flows, and save a safe dependency graph.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => router.push('/flows')}>Back to flows</button>
          <button className="btn btn-primary" onClick={saveFlow} disabled={saving || !flow}>Save flow</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          <label className="form-group">
            <span className="form-label">Name</span>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="form-group" style={{ gridColumn: 'span 2' }}>
            <span className="form-label">Description</span>
            <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>

        <label className="form-group" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <div>
            <div className="form-label" style={{ marginBottom: 2 }}>Publish to team library</div>
            <div className="muted" style={{ fontSize: 12 }}>Published flows can be reused as sub-routines in other flows.</div>
          </div>
        </label>
      </div>

      <FlowCanvas
        definitionJson={definitionJson}
        onDefinitionJsonChange={setDefinitionJson}
        catalog={catalog}
        flowLibrary={reusableLibrary}
        currentFlowId={flowId}
      />

      <div className="card">
        <div className="card-title">Raw definition</div>
        <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>{definitionJson}</pre>
      </div>
    </div>
  );
}
