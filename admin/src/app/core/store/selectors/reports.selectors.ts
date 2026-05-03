import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ReportsState } from '../app.state';

export const selectReportsFeature = createFeatureSelector<ReportsState>('reports');

export const selectTemplates = createSelector(selectReportsFeature, (state) => state.templates);
export const selectDraft = createSelector(selectReportsFeature, (state) => state.draft);
export const selectPreview = createSelector(selectReportsFeature, (state) => state.preview);
export const selectGeneratedReport = createSelector(selectReportsFeature, (state) => state.generated);
export const selectReportsLoading = createSelector(selectReportsFeature, (state) => state.loading);
export const selectReportsError = createSelector(selectReportsFeature, (state) => state.error);
export const selectReportsMessage = createSelector(selectReportsFeature, (state) => state.message);
