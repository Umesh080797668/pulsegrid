import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import * as SSOActions from '../../../core/store/actions/sso.actions';
import { selectLDAP, selectLDAPLoading, selectSSOError, selectTestResult } from '../../../core/store/selectors/sso.selectors';

@Component({
  selector: 'app-ldap-config',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatCardModule,
    MatSlideToggleModule,
  ],
  templateUrl: './ldap-config.html',
  styleUrl: './ldap-config.scss',
})
export class LdapConfig implements OnInit {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private snackBar = inject(MatSnackBar);

  ldapForm!: FormGroup;
  ldapConfig$: Observable<any>;
  loading$: Observable<boolean>;
  error$: Observable<string | null>;
  testResult$: Observable<any | null>;

  showTestResult = false;
  testResultData: any = null;

  constructor() {
    this.ldapForm = this.fb.group({
      serverUrl: ['', [Validators.required, Validators.pattern(/^ldaps?:\/\/.+/)]],
      port: [389, [Validators.required, Validators.min(1), Validators.max(65535)]],
      bindDn: ['', [Validators.required]],
      bindPassword: ['', [Validators.required]],
      searchBase: ['', [Validators.required]],
      searchFilter: ['(uid={0})', [Validators.required]],
      tlsEnabled: [true],
      starttls: [false],
      groupsBaseDn: [''],
      groupSearchFilter: [''],
    });

    this.ldapConfig$ = this.store.select(selectLDAP);
    this.loading$ = this.store.select(selectLDAPLoading);
    this.error$ = this.store.select(selectSSOError);
    this.testResult$ = this.store.select(selectTestResult);
  }

  ngOnInit(): void {
    this.store.dispatch(SSOActions.loadLDAP());

    this.ldapConfig$.subscribe((config) => {
      if (config) {
        this.ldapForm.patchValue(config);
      }
    });

    this.testResult$.subscribe((result) => {
      if (result) {
        this.testResultData = result;
        this.showTestResult = true;
        const message = result.success ? 'LDAP connection successful!' : `LDAP test failed: ${result.error}`;
        this.snackBar.open(message, 'Close', { duration: 5000 });
      }
    });

    this.error$.subscribe((error) => {
      if (error) {
        this.snackBar.open(error, 'Close', { duration: 5000 });
      }
    });
  }

  saveConfig(): void {
    if (this.ldapForm.valid) {
      this.store.dispatch(SSOActions.saveLDAP({ config: this.ldapForm.value }));
      this.snackBar.open('LDAP config saved successfully!', 'Close', { duration: 3000 });
    }
  }

  testConnection(): void {
    if (this.ldapForm.valid) {
      this.store.dispatch(SSOActions.testLDAP({ config: this.ldapForm.value }));
    }
  }

  clearTestResult(): void {
    this.showTestResult = false;
    this.testResultData = null;
    this.store.dispatch(SSOActions.clearTestResult());
  }

  reset(): void {
    this.ldapForm.reset({ tlsEnabled: true, port: 389 });
    this.clearTestResult();
  }
}
