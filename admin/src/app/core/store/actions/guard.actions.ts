import { createAction, props } from '@ngrx/store';
import {
  GuardAlert,
  GuardFilters,
  GuardIndexStatus,
  GuardMaintenanceState,
} from '../app.state';

export const loadGuardDashboard = createAction(
  '[Guard] Load Dashboard',
  props<{ filters?: GuardFilters }>(),
);

export const loadGuardDashboardSuccess = createAction(
  '[Guard] Load Dashboard Success',
  props<{
    alerts: GuardAlert[];
    total: number;
    limit: number;
    offset: number;
    maintenance: GuardMaintenanceState | null;
    indexStatus: GuardIndexStatus | null;
  }>(),
);

export const loadGuardDashboardFailure = createAction(
  '[Guard] Load Dashboard Failure',
  props<{ error: string }>(),
);

export const loadGuardAlert = createAction(
  '[Guard] Load Alert',
  props<{ id: string }>(),
);

export const loadGuardAlertSuccess = createAction(
  '[Guard] Load Alert Success',
  props<{ alert: GuardAlert }>(),
);

export const loadGuardAlertFailure = createAction(
  '[Guard] Load Alert Failure',
  props<{ error: string }>(),
);

export const setGuardFilters = createAction(
  '[Guard] Set Filters',
  props<{ filters: GuardFilters }>(),
);

export const clearGuardFilters = createAction('[Guard] Clear Filters');

export const selectGuardAlert = createAction(
  '[Guard] Select Alert',
  props<{ id: string | null }>(),
);

export const acknowledgeGuardAlert = createAction(
  '[Guard] Acknowledge Alert',
  props<{ id: string; actorUserId?: string }>(),
);

export const resolveGuardAlert = createAction(
  '[Guard] Resolve Alert',
  props<{ id: string; actorUserId?: string }>(),
);

export const dismissGuardAlert = createAction(
  '[Guard] Dismiss Alert',
  props<{ id: string; actorUserId?: string }>(),
);

export const createGuardGithubIssue = createAction(
  '[Guard] Create GitHub Issue',
  props<{ id: string; owner?: string; repo?: string; baseBranch?: string }>(),
);

export const clearGuardMaintenance = createAction(
  '[Guard] Clear Maintenance',
  props<{ tenantId?: string; actorUserId?: string; reason?: string }>(),
);

export const rebuildGuardIndex = createAction(
  '[Guard] Rebuild Index',
  props<{ requestedBy?: string; reason?: string }>(),
);

export const guardActionFailure = createAction(
  '[Guard] Action Failure',
  props<{ error: string }>(),
);