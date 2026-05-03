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

