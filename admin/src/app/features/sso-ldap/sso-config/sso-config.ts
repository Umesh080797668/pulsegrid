import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import * as SSOActions from '../../../core/store/actions/sso.actions';
import { selectSSO, selectSSOLoading, selectSSOError, selectTestResult } from '../../../core/store/selectors/sso.selectors';

@Component({
  selector: 'app-sso-config',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatCardModule,
  ],
  templateUrl: './sso-config.html',
  styleUrl: './sso-config.scss',
})
export class SsoConfig implements OnInit {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private snackBar = inject(MatSnackBar);

  ssoForm!: FormGroup;
  ssoConfig$: Observable<any>;
  loading$: Observable<boolean>;
  error$: Observable<string | null>;
  testResult$: Observable<any | null>;

  providers = ['OAuth2', 'SAML', 'OpenID Connect', 'Azure AD', 'Google Workspace'];
  showTestResult = false;
  testResultData: any = null;

  constructor() {
    this.ssoForm = this.fb.group({
      provider: ['', [Validators.required]],
      clientId: ['', [Validators.required]],
      clientSecret: ['', [Validators.required]],
      callbackUrl: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
      scope: [''],
      discoveryUrl: [''],
    });

    this.ssoConfig$ = this.store.select(selectSSO);
    this.loading$ = this.store.select(selectSSOLoading);
    this.error$ = this.store.select(selectSSOError);
    this.testResult$ = this.store.select(selectTestResult);
  }

  ngOnInit(): void {
    this.store.dispatch(SSOActions.loadSSO());

    this.ssoConfig$.subscribe((config) => {
      if (config) {
        this.ssoForm.patchValue(config);
      }
    });

    this.testResult$.subscribe((result) => {
      if (result) {
        this.testResultData = result;
        this.showTestResult = true;
        const message = result.success ? 'SSO connection successful!' : `SSO test failed: ${result.error}`;
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
    if (this.ssoForm.valid) {
      this.store.dispatch(SSOActions.saveSSO({ config: this.ssoForm.value }));
      this.snackBar.open('SSO config saved successfully!', 'Close', { duration: 3000 });
    }
  }

  testConnection(): void {
    if (this.ssoForm.valid) {
      this.store.dispatch(SSOActions.testSSO({ config: this.ssoForm.value }));
    }
  }

  clearTestResult(): void {
    this.showTestResult = false;
    this.testResultData = null;
    this.store.dispatch(SSOActions.clearTestResult());
  }

  reset(): void {
    this.ssoForm.reset();
    this.clearTestResult();
  }
}
