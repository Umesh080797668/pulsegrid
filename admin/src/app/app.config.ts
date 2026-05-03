import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideStore, provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { httpInterceptor } from './core/interceptors/http-interceptor';
import { UserEffects } from './core/store/effects/user.effects';
import { AuditEffects } from './core/store/effects/audit.effects';
import { WorkspaceEffects } from './core/store/effects/workspace.effects';
import { BillingEffects } from './core/store/effects/billing.effects';
import { ComplianceEffects } from './core/store/effects/compliance.effects';
import { ConnectorEffects } from './core/store/effects/connector.effects';
import { SSOEffects } from './core/store/effects/sso.effects';
import { ReportsEffects } from './core/store/effects/reports.effects';
import { userReducer } from './core/store/reducers/user.reducer';
import { authReducer } from './core/store/reducers/auth.reducer';
import { workspaceReducer } from './core/store/reducers/workspace.reducer';
import { auditReducer } from './core/store/reducers/audit.reducer';
import { complianceReducer } from './core/store/reducers/compliance.reducer';
import { connectorReducer } from './core/store/reducers/connector.reducer';
import { ssoReducer } from './core/store/reducers/sso.reducer';
import { reportsReducer } from './core/store/reducers/reports.reducer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi()),
    provideStore({
      auth: authReducer,
      users: userReducer,
      workspaces: workspaceReducer,
      audit: auditReducer,
      compliance: complianceReducer,
      connectors: connectorReducer,
      sso: ssoReducer,
      reports: reportsReducer,
    }),
    provideEffects(UserEffects, AuditEffects, WorkspaceEffects, BillingEffects, ComplianceEffects, ConnectorEffects, SSOEffects, ReportsEffects),
    // Effects provided in main bootstrap via importProvidersFrom when necessary
    provideStoreDevtools({ maxAge: 25 }),
  ],
};
