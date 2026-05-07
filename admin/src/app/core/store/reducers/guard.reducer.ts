import { createReducer, on } from '@ngrx/store';
import { GuardState } from '../app.state';
import * as GuardActions from '../actions/guard.actions';

const initialState: GuardState = {
  alerts: [],
  total: 0,
  limit: 20,
  offset: 0,
  loading: false,
  detailLoading: false,
  maintenanceLoading: false,
  indexLoading: false,
  error: null,
  filters: {
    limit: 20,
    offset: 0,
  },
  selectedAlertId: null,
  selectedAlert: null,
  maintenance: null,
  indexStatus: null,
};

export const guardReducer = createReducer(
  initialState,
  on(GuardActions.loadGuardDashboard, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(GuardActions.loadGuardDashboardSuccess, (state, { alerts, total, limit, offset, maintenance, indexStatus }) => ({
    ...state,
    alerts,
    total,
    limit,
    offset,
    loading: false,
    detailLoading: false,
    maintenanceLoading: false,
    indexLoading: false,
    maintenance,
    indexStatus,
    error: null,
    selectedAlert:
      state.selectedAlertId != null
        ? alerts.find((alert) => alert.id === state.selectedAlertId) ?? state.selectedAlert
        : state.selectedAlert,
  })),
  on(GuardActions.loadGuardDashboardFailure, (state, { error }) => ({
    ...state,
    loading: false,
    detailLoading: false,
    maintenanceLoading: false,
    indexLoading: false,
    error,
  })),
  on(GuardActions.loadGuardAlert, (state, { id }) => ({
    ...state,
    detailLoading: true,
    error: null,
    selectedAlertId: id,
  })),
  on(GuardActions.loadGuardAlertSuccess, (state, { alert }) => ({
    ...state,
    detailLoading: false,
    error: null,
    selectedAlertId: alert.id,
    selectedAlert: alert,
    alerts: state.alerts.map((item) => (item.id === alert.id ? alert : item)),
  })),
  on(GuardActions.loadGuardAlertFailure, (state, { error }) => ({
    ...state,
    detailLoading: false,
    error,
  })),
  on(GuardActions.setGuardFilters, (state, { filters }) => ({
    ...state,
    filters: {
      ...state.filters,
      ...filters,
      limit: filters.limit ?? state.filters.limit ?? 20,
      offset: filters.offset ?? state.filters.offset ?? 0,
    },
    offset: filters.offset ?? state.offset,
    limit: filters.limit ?? state.limit,
  })),
  on(GuardActions.clearGuardFilters, (state) => ({
    ...state,
    filters: {
      limit: 20,
      offset: 0,
    },
    offset: 0,
    limit: 20,
  })),
  on(GuardActions.selectGuardAlert, (state, { id }) => ({
    ...state,
    selectedAlertId: id,
    selectedAlert: id ? state.alerts.find((alert) => alert.id === id) ?? state.selectedAlert : null,
  })),
  on(GuardActions.acknowledgeGuardAlert, GuardActions.resolveGuardAlert, GuardActions.dismissGuardAlert, GuardActions.createGuardGithubIssue, (state) => ({
    ...state,
    detailLoading: true,
    error: null,
  })),
  on(GuardActions.clearGuardMaintenance, GuardActions.rebuildGuardIndex, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(GuardActions.guardActionFailure, (state, { error }) => ({
    ...state,
    loading: false,
    detailLoading: false,
    maintenanceLoading: false,
    indexLoading: false,
    error,
  }))
);