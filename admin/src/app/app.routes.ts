import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'admin/sso' },
  {
    path: 'admin/sso',
    loadComponent: () => import('./components/sso/sso').then((m) => m.SsoAdminPage),
  },
  {
    path: 'admin/guard',
    loadComponent: () => import('./features/guard/guard-page/guard-page').then((m) => m.GuardPageComponent),
  },
  {
    path: 'admin/guard/:id',
    loadComponent: () => import('./features/guard/guard-page/guard-page').then((m) => m.GuardPageComponent),
  },
  {
    path: 'admin/reports',
    loadComponent: () => import('./features/reports/jasper-reports/jasper-reports').then((m) => m.JasperReports),
  },
  { path: '**', redirectTo: 'admin/sso' },
];
