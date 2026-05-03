import { Routes } from '@angular/router';
import { SsoAdminPage } from './components/sso/sso';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'admin/sso' },
  { path: 'admin/sso', component: SsoAdminPage },
  { path: '**', redirectTo: 'admin/sso' },
];
