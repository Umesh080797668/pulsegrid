import { createAction, props } from '@ngrx/store';

export const loadSSO = createAction('[SSO] Load SSO Config');

export const loadSSOSuccess = createAction(
  '[SSO] Load SSO Config Success',
  props<{ config: any }>()
);

export const loadSSOFailure = createAction(
  '[SSO] Load SSO Config Failure',
  props<{ error: string }>()
);

export const saveSSO = createAction(
  '[SSO] Save SSO Config',
  props<{ config: any }>()
);

export const saveSSOSuccess = createAction(
  '[SSO] Save SSO Config Success',
  props<{ config: any }>()
);

export const saveSSOFailure = createAction(
  '[SSO] Save SSO Config Failure',
  props<{ error: string }>()
);

export const testSSO = createAction(
  '[SSO] Test SSO Connection',
  props<{ config: any }>()
);

export const testSSOSuccess = createAction(
  '[SSO] Test SSO Connection Success',
  props<{ result: any }>()
);

export const testSSOFailure = createAction(
  '[SSO] Test SSO Connection Failure',
  props<{ error: string }>()
);

export const loadLDAP = createAction('[LDAP] Load LDAP Config');

export const loadLDAPSuccess = createAction(
  '[LDAP] Load LDAP Config Success',
  props<{ config: any }>()
);

export const loadLDAPFailure = createAction(
  '[LDAP] Load LDAP Config Failure',
  props<{ error: string }>()
);

export const saveLDAP = createAction(
  '[LDAP] Save LDAP Config',
  props<{ config: any }>()
);

export const saveLDAPSuccess = createAction(
  '[LDAP] Save LDAP Config Success',
  props<{ config: any }>()
);

export const saveLDAPFailure = createAction(
  '[LDAP] Save LDAP Config Failure',
  props<{ error: string }>()
);

export const testLDAP = createAction(
  '[LDAP] Test LDAP Connection',
  props<{ config: any }>()
);

export const testLDAPSuccess = createAction(
  '[LDAP] Test LDAP Connection Success',
  props<{ result: any }>()
);

export const testLDAPFailure = createAction(
  '[LDAP] Test LDAP Connection Failure',
  props<{ error: string }>()
);

export const clearTestResult = createAction('[SSO/LDAP] Clear Test Result');
