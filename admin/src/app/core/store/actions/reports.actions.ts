import { createAction, props } from '@ngrx/store';

export const loadTemplates = createAction('[Reports] Load Templates');
export const loadTemplatesSuccess = createAction(
  '[Reports] Load Templates Success',
  props<{ templates: any[] }>()
);
export const loadTemplatesFailure = createAction(
  '[Reports] Load Templates Failure',
  props<{ error: string }>()
);

export const buildReport = createAction(
  '[Reports] Build Report',
  props<{ payload: any }>()
);
export const buildReportSuccess = createAction(
  '[Reports] Build Report Success',
  props<{ draft: any }>()
);
export const buildReportFailure = createAction(
  '[Reports] Build Report Failure',
  props<{ error: string }>()
);

export const previewReport = createAction(
  '[Reports] Preview Report',
  props<{ payload: any }>()
);
export const previewReportSuccess = createAction(
  '[Reports] Preview Report Success',
  props<{ preview: any }>()
);
export const previewReportFailure = createAction(
  '[Reports] Preview Report Failure',
  props<{ error: string }>()
);

export const generateReport = createAction(
  '[Reports] Generate Report',
  props<{ payload: any }>()
);
export const generateReportSuccess = createAction(
  '[Reports] Generate Report Success',
  props<{ generated: any }>()
);
export const generateReportFailure = createAction(
  '[Reports] Generate Report Failure',
  props<{ error: string }>()
);

export const downloadReport = createAction(
  '[Reports] Download Report',
  props<{ reportId: string; format: 'pdf' | 'csv' | 'xlsx' }>()
);
export const clearReportMessage = createAction('[Reports] Clear Message');
