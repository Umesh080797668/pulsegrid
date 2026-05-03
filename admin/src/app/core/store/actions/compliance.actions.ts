import { createAction, props } from '@ngrx/store';

export const loadCompliance = createAction(
  '[Compliance] Load Compliance'
);

export const loadComplianceSuccess = createAction(
  '[Compliance] Load Compliance Success',
  props<{ policies: any[]; violations: any[]; metrics: any }>()
);

export const loadComplianceFailure = createAction(
  '[Compliance] Load Compliance Failure',
  props<{ error: string }>()
);

export const runComplianceAudit = createAction(
  '[Compliance] Run Compliance Audit'
);

export const viewComplianceReport = createAction(
  '[Compliance] View Compliance Report',
  props<{ reportId: string }>()
);

export const exportComplianceReport = createAction(
  '[Compliance] Export Compliance Report',
  props<{ reportId: string; format: 'pdf' | 'csv' }>()
);

export const updateCompliancePolicy = createAction(
  '[Compliance] Update Compliance Policy',
  props<{ policyId: string; policy: any }>()
);

export const scheduleComplianceAudit = createAction(
  '[Compliance] Schedule Compliance Audit',
  props<{ frequency: string; time: string }>()
);
