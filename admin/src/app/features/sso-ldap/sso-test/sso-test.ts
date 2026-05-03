import { Component, OnInit, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import * as SSOActions from '../../../core/store/actions/sso.actions';
import { selectSSO, selectLDAP, selectSSOLoading, selectLDAPLoading, selectTestResult } from '../../../core/store/selectors/sso.selectors';

@Component({
  selector: 'app-sso-test',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatIconModule,
  ],
  templateUrl: './sso-test.html',
  styleUrl: './sso-test.scss',
})
export class SsoTest implements OnInit {
  private store = inject(Store);

  ssoConfig$: Observable<any>;
  ldapConfig$: Observable<any>;
  ssoLoading$: Observable<boolean>;
  ldapLoading$: Observable<boolean>;
  testResult$: Observable<any | null>;

  ssoStatus: 'not-tested' | 'testing' | 'success' | 'failure' = 'not-tested';
  ldapStatus: 'not-tested' | 'testing' | 'success' | 'failure' = 'not-tested';
  ssoTestMessage = '';
  ldapTestMessage = '';

  constructor() {
    this.ssoConfig$ = this.store.select(selectSSO);
    this.ldapConfig$ = this.store.select(selectLDAP);
    this.ssoLoading$ = this.store.select(selectSSOLoading);
    this.ldapLoading$ = this.store.select(selectLDAPLoading);
    this.testResult$ = this.store.select(selectTestResult);
  }

  ngOnInit(): void {
    this.store.dispatch(SSOActions.loadSSO());
    this.store.dispatch(SSOActions.loadLDAP());

    this.ssoLoading$.subscribe((loading) => {
      if (loading) {
        this.ssoStatus = 'testing';
      }
    });

    this.ldapLoading$.subscribe((loading) => {
      if (loading) {
        this.ldapStatus = 'testing';
      }
    });

    this.testResult$.subscribe((result) => {
      if (result) {
        if (result.type === 'sso') {
          this.ssoStatus = result.success ? 'success' : 'failure';
          this.ssoTestMessage = result.message || result.error || 'Test completed';
        } else if (result.type === 'ldap') {
          this.ldapStatus = result.success ? 'success' : 'failure';
          this.ldapTestMessage = result.message || result.error || 'Test completed';
        }
      }
    });
  }

  testSSO(): void {
    this.ssoConfig$.subscribe((config) => {
      if (config) {
        this.store.dispatch(SSOActions.testSSO({ config }));
      }
    }).unsubscribe();
  }

  testLDAP(): void {
    this.ldapConfig$.subscribe((config) => {
      if (config) {
        this.store.dispatch(SSOActions.testLDAP({ config }));
      }
    }).unsubscribe();
  }

  resetSSO(): void {
    this.ssoStatus = 'not-tested';
    this.ssoTestMessage = '';
    this.store.dispatch(SSOActions.clearTestResult());
  }

  resetLDAP(): void {
    this.ldapStatus = 'not-tested';
    this.ldapTestMessage = '';
    this.store.dispatch(SSOActions.clearTestResult());
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'success':
        return 'accent';
      case 'failure':
        return 'warn';
      default:
        return 'primary';
    }
  }

  getStatusIcon(status: string): string {
    switch (status) {
      case 'success':
        return 'check_circle';
      case 'failure':
        return 'error';
      case 'testing':
        return 'hourglass_empty';
      default:
        return 'help';
    }
  }
}
