import { createFeatureSelector, createSelector } from '@ngrx/store';
import { SSOState } from '../app.state';

export const selectSSOFeature = createFeatureSelector<SSOState>('sso');

export const selectSSO = createSelector(selectSSOFeature, (state) => state.ssoConfig);
export const selectLDAP = createSelector(selectSSOFeature, (state) => state.ldapConfig);
export const selectSSOLoading = createSelector(selectSSOFeature, (state) => state.ssoLoading);
export const selectLDAPLoading = createSelector(selectSSOFeature, (state) => state.ldapLoading);
export const selectSSOError = createSelector(selectSSOFeature, (state) => state.error);
export const selectTestResult = createSelector(selectSSOFeature, (state) => state.testResult);
