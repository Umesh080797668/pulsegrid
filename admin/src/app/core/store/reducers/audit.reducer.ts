import { createReducer, on } from '@ngrx/store';
import { AuditState, PaginationState } from '../app.state';
import * as AuditActions from '../actions/audit.actions';

const initialPaginationState: PaginationState = {
  pageIndex: 0,
  pageSize: 20,
  total: 0,
};

const initialState: AuditState = {
  logs: [],
  loading: false,
  error: null,
  pagination: initialPaginationState,
  filters: {},
};

export const auditReducer = createReducer(
  initialState,
  on(AuditActions.loadAuditLogs, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(AuditActions.loadAuditLogsSuccess, (state, { logs, total }) => ({
    ...state,
    logs,
    loading: false,
    pagination: { ...state.pagination, total },
  })),
  on(AuditActions.loadAuditLogsFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(AuditActions.filterAuditLogs, (state, { filters }) => ({
    ...state,
    filters,
  })),
  on(AuditActions.clearAuditFilters, (state) => ({
    ...state,
    filters: {},
  }))
);
