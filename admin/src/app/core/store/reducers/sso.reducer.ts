import { createReducer, on } from '@ngrx/store';
import { SSOState } from '../app.state';
import * as SSOActions from '../actions/sso.actions';

const initialState: SSOState = {
  ssoConfig: null,
  ldapConfig: null,
  ssoLoading: false,
  ldapLoading: false,
  error: null,
  testResult: null,
};

export const ssoReducer = createReducer(
  initialState,
  on(SSOActions.loadSSO, (state) => ({
    ...state,
    ssoLoading: true,
    error: null,
  })),
  on(SSOActions.loadSSOSuccess, (state, { config }) => ({
    ...state,
    ssoConfig: config,
    ssoLoading: false,
  })),
  on(SSOActions.loadSSOFailure, (state, { error }) => ({
    ...state,
    ssoLoading: false,
    error,
  })),
  on(SSOActions.saveSSO, (state) => ({
    ...state,
    ssoLoading: true,
    error: null,
  })),
  on(SSOActions.saveSSOSuccess, (state, { config }) => ({
    ...state,
    ssoConfig: config,
    ssoLoading: false,
  })),
  on(SSOActions.saveSSOFailure, (state, { error }) => ({
    ...state,
    ssoLoading: false,
    error,
  })),
  on(SSOActions.testSSO, (state) => ({
    ...state,
    ssoLoading: true,
    error: null,
  })),
  on(SSOActions.testSSOSuccess, (state, { result }) => ({
    ...state,
    ssoLoading: false,
    testResult: result,
  })),
  on(SSOActions.testSSOFailure, (state, { error }) => ({
    ...state,
    ssoLoading: false,
    error,
  })),
  on(SSOActions.loadLDAP, (state) => ({
    ...state,
    ldapLoading: true,
    error: null,
  })),
  on(SSOActions.loadLDAPSuccess, (state, { config }) => ({
    ...state,
    ldapConfig: config,
    ldapLoading: false,
  })),
  on(SSOActions.loadLDAPFailure, (state, { error }) => ({
    ...state,
    ldapLoading: false,
    error,
  })),
  on(SSOActions.saveLDAP, (state) => ({
    ...state,
    ldapLoading: true,
    error: null,
  })),
  on(SSOActions.saveLDAPSuccess, (state, { config }) => ({
    ...state,
    ldapConfig: config,
    ldapLoading: false,
  })),
  on(SSOActions.saveLDAPFailure, (state, { error }) => ({
    ...state,
    ldapLoading: false,
    error,
  })),
  on(SSOActions.testLDAP, (state) => ({
    ...state,
    ldapLoading: true,
    error: null,
  })),
  on(SSOActions.testLDAPSuccess, (state, { result }) => ({
    ...state,
    ldapLoading: false,
    testResult: result,
  })),
  on(SSOActions.testLDAPFailure, (state, { error }) => ({
    ...state,
    ldapLoading: false,
    error,
  })),
  on(SSOActions.clearTestResult, (state) => ({
    ...state,
    testResult: null,
  }))
);
