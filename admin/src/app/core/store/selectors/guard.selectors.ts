import { createFeatureSelector, createSelector } from '@ngrx/store';
import { GuardState } from '../app.state';

export const selectGuardState = createFeatureSelector<GuardState>('guard');

export const selectGuardAlerts = createSelector(
  selectGuardState,
  (state: GuardState) => state.alerts,
);

export const selectGuardLoading = createSelector(
  selectGuardState,
  (state: GuardState) => state.loading,
);

export const selectGuardDetailLoading = createSelector(
  selectGuardState,
  (state: GuardState) => state.detailLoading,
);

export const selectGuardError = createSelector(
  selectGuardState,
  (state: GuardState) => state.error,
);

export const selectGuardFilters = createSelector(
  selectGuardState,
  (state: GuardState) => state.filters,
);

export const selectGuardPagination = createSelector(
  selectGuardState,
  (state: GuardState) => ({
    total: state.total,
    limit: state.limit,
    offset: state.offset,
  }),
);

export const selectGuardSelectedAlert = createSelector(
  selectGuardState,
  (state: GuardState) => state.selectedAlert,
);

export const selectGuardMaintenance = createSelector(
  selectGuardState,
  (state: GuardState) => state.maintenance,
);

export const selectGuardIndexStatus = createSelector(
  selectGuardState,
  (state: GuardState) => state.indexStatus,
);
