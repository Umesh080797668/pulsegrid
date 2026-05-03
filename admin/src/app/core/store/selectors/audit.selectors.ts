import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AuditState } from '../app.state';

export const selectAuditState = createFeatureSelector<AuditState>('audit');

export const selectAllAuditLogs = createSelector(
  selectAuditState,
  (state: AuditState) => state.logs
);

export const selectAuditLoading = createSelector(
  selectAuditState,
  (state: AuditState) => state.loading
);

export const selectAuditError = createSelector(
  selectAuditState,
  (state: AuditState) => state.error
);

export const selectAuditPagination = createSelector(
  selectAuditState,
  (state: AuditState) => state.pagination
);

export const selectAuditFilters = createSelector(
  selectAuditState,
  (state: AuditState) => state.filters
);

export const selectFilteredAuditLogs = createSelector(
  selectAllAuditLogs,
  selectAuditFilters,
  (logs, filters) => {
    return logs.filter((log) => {
      if (filters.action && log.action !== filters.action) return false;
      if (filters.user && log.user !== filters.user) return false;
      if (filters.resource && log.resource !== filters.resource) return false;
      return true;
    });
  }
);
