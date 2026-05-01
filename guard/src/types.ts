// Guard Event DTOs and Types
export interface GuardEvent {
  id: string;
  tenant_id: string;
  source: 'dashboard' | 'api_gateway' | 'spring_boot' | 'pulsecore';
  severity: 'warning' | 'error' | 'critical';
  category: string;
  message: string;
  stack_trace: string | null;
  surrounding_logs: LogLine[];
  affected_connector: string | null;
  affected_flow_ids: string[];
  deployment_sha: string;
  received_at: string;
  metadata: Record<string, any>;
}

export interface LogLine {
  timestamp: string;
  level: string;
  message: string;
}

export interface TriageContext {
  event: GuardEvent;
  relevantFiles: CodebaseIndexRow[];
  recentDeploys: DeploymentInfo[];
  connectorHealth: ConnectorHealthSnapshot | null;
  surroundingLogs: LogLine[];
}

export interface CodebaseIndexRow {
  file_path: string;
  language: string;
  function_sigs: any;
  error_patterns: string[];
}

export interface DeploymentInfo {
  sha: string;
  message: string;
  deployedAt: string;
}

export interface ConnectorHealthSnapshot {
  connector: string;
  errorRate: number;
  uptime: number;
  lastError?: string;
}

export interface TriageResult {
  root_cause: string;
  explanation: string;
  confidence: number;
  severity_recommendation: 'warning' | 'error' | 'critical';
  maintenance_scope: 'none' | 'flows_only' | 'full';
  affected_file_path: string | null;
  code_suggestion?: {
    file_path: string;
    original_snippet: string;
    suggested_snippet: string;
    explanation: string;
  };
  search_queries: string[];
}

export interface ResearchResult {
  sources: {
    url: string;
    relevance: string;
    summary: string;
  }[];
  cve_ids: string[];
  recommended_dep_versions: Record<string, string>;
}

export interface MaintenanceResult {
  scope: 'none' | 'flows_only' | 'full';
  pausedFlows: string[];
}

export interface GuardAlert {
  id: string;
  tenant_id: string;
  guard_event_id: string;
  severity: string;
  source: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'dismissed';
  ai_diagnosis: TriageResult | null;
  ai_confidence: number;
  web_sources: ResearchResult | null;
  code_suggestion: any;
  maintenance_scope: MaintenanceResult | null;
  github_issue_url: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}
