import { createAction, props } from '@ngrx/store';
import { AuditLog, AuditFilters } from '../../store/app.state';

export const loadAuditLogs = createAction(
  '[Audit] Load Audit Logs',
  props<{ page?: number; size?: number; filters?: AuditFilters }>()
);

export const loadAuditLogsSuccess = createAction(
  '[Audit] Load Audit Logs Success',
  props<{ logs: AuditLog[]; total: number }>()
);

export const loadAuditLogsFailure = createAction(
  '[Audit] Load Audit Logs Failure',
  props<{ error: string }>()
);

export const filterAuditLogs = createAction(
  '[Audit] Filter Audit Logs',
  props<{ filters: AuditFilters }>()
);

export const clearAuditFilters = createAction(
  '[Audit] Clear Audit Filters'
);

export const exportAuditLogs = createAction(
  '[Audit] Export Audit Logs',
  props<{ format: 'csv' | 'pdf' | 'json' }>()
);
