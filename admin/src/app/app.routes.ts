import { Routes } from '@angular/router';
import { SsoAdminPageComponent } from './sso-admin-page.component';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', redirectTo: 'admin/sso' },
	{ path: 'admin/sso', component: SsoAdminPageComponent },
	{ path: '**', redirectTo: 'admin/sso' },
];
