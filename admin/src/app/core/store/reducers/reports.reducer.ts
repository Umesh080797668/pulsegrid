import { createReducer, on } from '@ngrx/store';
import { ReportsState } from '../app.state';
import * as ReportsActions from '../actions/reports.actions';

const initialState: ReportsState = {
  templates: [],
  draft: null,
  preview: null,
  generated: null,
  loading: false,
  error: null,
  message: '',
};

export const reportsReducer = createReducer(
  initialState,
  on(ReportsActions.loadTemplates, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(ReportsActions.loadTemplatesSuccess, (state, { templates }) => ({
    ...state,
    templates,
    loading: false,
  })),
  on(ReportsActions.loadTemplatesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(ReportsActions.buildReport, (state) => ({
    ...state,
    loading: true,
    error: null,
    message: 'Building report draft...',
  })),
  on(ReportsActions.buildReportSuccess, (state, { draft }) => ({
    ...state,
    loading: false,
    draft,
    message: 'Report draft generated.',
  })),
  on(ReportsActions.buildReportFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(ReportsActions.previewReport, (state) => ({
    ...state,
    loading: true,
    error: null,
    message: 'Preparing preview...',
  })),
  on(ReportsActions.previewReportSuccess, (state, { preview }) => ({
    ...state,
    loading: false,
    preview,
    message: 'Preview ready.',
  })),
  on(ReportsActions.previewReportFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(ReportsActions.generateReport, (state) => ({
    ...state,
    loading: true,
    error: null,
    message: 'Generating report...',
  })),
  on(ReportsActions.generateReportSuccess, (state, { generated }) => ({
    ...state,
    loading: false,
    generated,
    message: 'Report generated successfully.',
  })),
  on(ReportsActions.generateReportFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(ReportsActions.clearReportMessage, (state) => ({
    ...state,
    message: '',
    error: null,
  }))
);
