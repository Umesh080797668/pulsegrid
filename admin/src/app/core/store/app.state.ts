/**
 * Root state interface for the application
 */
export interface AppState {
  auth: AuthState;
  users: UserState;
  workspaces: WorkspaceState;
  billing: BillingState;
  audit: AuditState;
  compliance: ComplianceState;
  connectors: ConnectorState;
  sso: SSOState;
  reports: ReportsState;
}

export interface AuthState {
  user: any | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  authenticated: boolean;
}

export interface UserState {
  users: any[];
  roles: any[];
  selectedUser: any | null;
  loading: boolean;
  error: string | null;
  pagination: PaginationState;
}

export interface WorkspaceState {
  workspaces: any[];
  selectedWorkspace: any | null;
  loading: boolean;
  error: string | null;
}

export interface BillingState {
  invoices: any[];
  subscriptions: any[];
  selectedInvoice: any | null;
  loading: boolean;
  error: string | null;
}

export interface AuditState {
  logs: AuditLog[];
  loading: boolean;
  error: string | null;
  pagination: PaginationState;
  filters: AuditFilters;
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  action: string;
  user: string;
  resource: string;
  details: string;
  status: 'success' | 'failure';
}

export interface AuditFilters {
  action?: string;
  user?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ComplianceState {
  policies: any[];
  violations: any[];
  metrics: ComplianceMetrics;
  loading: boolean;
  error: string | null;
}

export interface ComplianceMetrics {
  overallScore: number;
  policiesChecked: number;
  violationsFound: number;
  lastAudit: Date;
}

export interface ConnectorState {
  connectors: Connector[];
  allowlist: string[];
  blocklist: string[];
  selectedConnector: Connector | null;
  loading: boolean;
  error: string | null;
}

export interface Connector {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'inactive' | 'blocked';
  lastModified: Date;
  config: any;
}

export interface PaginationState {
  pageIndex: number;
  pageSize: number;
  total: number;
}

export interface SSOState {
  ssoConfig: any | null;
  ldapConfig: any | null;
  ssoLoading: boolean;
  ldapLoading: boolean;
  error: string | null;
  testResult: any | null;
}

export interface ReportsState {
  templates: any[];
  draft: any | null;
  preview: any | null;
  generated: any | null;
  loading: boolean;
  error: string | null;
  message: string;
}

export type GuardSeverity = 'warning' | 'error' | 'critical';

export type GuardAlertStatus = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

export interface GuardFilters {
  tenant_id?: string;
  status?: GuardAlertStatus;
  severity?: GuardSeverity;
  limit?: number;
  offset?: number;
}

export interface GuardLogLine {
  timestamp: string;
  level: string;
  message: string;
}

export interface GuardCodeSuggestion {
  file_path: string;
  original_snippet: string;
  suggested_snippet: string;
  explanation: string;
}

export interface GuardTriageResult {
  root_cause: string;
  explanation: string;
  confidence: number;
  severity_recommendation: GuardSeverity;
  maintenance_scope: 'none' | 'flows_only' | 'full';
  affected_file_path: string | null;
  code_suggestion?: GuardCodeSuggestion | null;
  search_queries: string[];
}

export interface GuardResearchResult {
  sources: Array<{
    url: string;
    relevance: string;
    summary: string;
  }>;
  cve_ids: string[];
  recommended_dep_versions: Record<string, string>;
}

export interface GuardMaintenanceResult {
  scope: 'none' | 'flows_only' | 'full';
  pausedFlows: string[];
}

export interface GuardAlert {
  id: string;
  tenant_id: string;
  guard_event_id: string;
  severity: GuardSeverity | string;
  source: string;
  status: GuardAlertStatus;
  ai_diagnosis: GuardTriageResult | null;
  ai_confidence: number;
  web_sources: GuardResearchResult | null;
  code_suggestion: GuardCodeSuggestion | null;
  maintenance_scope: GuardMaintenanceResult | null;
  github_issue_url: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface GuardMaintenanceState {
  maintenance_active: boolean;
  states: Array<{
    key: string;
    value?: string | null;
    state: any;
  }>;
}

export interface GuardIndexStatus {
  status: 'ok' | 'degraded';
  last_rebuilt: string | null;
  file_count: number;
}

export interface GuardState {
  alerts: GuardAlert[];
  total: number;
  limit: number;
  offset: number;
  loading: boolean;
  detailLoading: boolean;
  maintenanceLoading: boolean;
  indexLoading: boolean;
  error: string | null;
  filters: GuardFilters;
  selectedAlertId: string | null;
  selectedAlert: GuardAlert | null;
  maintenance: GuardMaintenanceState | null;
  indexStatus: GuardIndexStatus | null;
}

