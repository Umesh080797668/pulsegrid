import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as SSOActions from '../actions/sso.actions';
import { Api } from '../../services/api';
import { catchError, map, mergeMap, of } from 'rxjs';

@Injectable()
export class SSOEffects {
  private actions$ = inject(Actions);
  private api = inject(Api);

  loadSSO$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SSOActions.loadSSO),
      mergeMap(() =>
        this.api.get('/admin/sso/config').pipe(
          map((config: any) =>
            SSOActions.loadSSOSuccess({ config })
          ),
          catchError((error) =>
            of(
              SSOActions.loadSSOFailure({
                error: error?.message || 'Failed to load SSO config',
              })
            )
          )
        )
      )
    )
  );

  saveSSO$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SSOActions.saveSSO),
      mergeMap(({ config }) =>
        this.api.post('/admin/sso/config', config).pipe(
          map((res: any) =>
            SSOActions.saveSSOSuccess({ config: res })
          ),
          catchError((error) =>
            of(
              SSOActions.saveSSOFailure({
                error: error?.message || 'Failed to save SSO config',
              })
            )
          )
        )
      )
    )
  );

  testSSO$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SSOActions.testSSO),
      mergeMap(({ config }) =>
        this.api.post('/admin/sso/test', config).pipe(
          map((result: any) =>
            SSOActions.testSSOSuccess({ result })
          ),
          catchError((error) =>
            of(
              SSOActions.testSSOFailure({
                error: error?.message || 'SSO connection test failed',
              })
            )
          )
        )
      )
    )
  );

  loadLDAP$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SSOActions.loadLDAP),
      mergeMap(() =>
        this.api.get('/admin/ldap/config').pipe(
          map((config: any) =>
            SSOActions.loadLDAPSuccess({ config })
          ),
          catchError((error) =>
            of(
              SSOActions.loadLDAPFailure({
                error: error?.message || 'Failed to load LDAP config',
              })
            )
          )
        )
      )
    )
  );

  saveLDAP$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SSOActions.saveLDAP),
      mergeMap(({ config }) =>
        this.api.post('/admin/ldap/config', config).pipe(
          map((res: any) =>
            SSOActions.saveLDAPSuccess({ config: res })
          ),
          catchError((error) =>
            of(
              SSOActions.saveLDAPFailure({
                error: error?.message || 'Failed to save LDAP config',
              })
            )
          )
        )
      )
    )
  );

  testLDAP$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SSOActions.testLDAP),
      mergeMap(({ config }) =>
        this.api.post('/admin/ldap/test', config).pipe(
          map((result: any) =>
            SSOActions.testLDAPSuccess({ result })
          ),
          catchError((error) =>
            of(
              SSOActions.testLDAPFailure({
                error: error?.message || 'LDAP connection test failed',
              })
            )
          )
        )
      )
    )
  );
}
