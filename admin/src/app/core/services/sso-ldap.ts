import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Api } from './api';

@Injectable({
  providedIn: 'root',
})
export class SsoLdap {
  constructor(private api: Api, private http: HttpClient) {}

  /**
   * Get SSO configuration
   */
  getSSO(): Observable<any> {
    return this.api.get('/admin/sso/config');
  }

  /**
   * Save SSO configuration
   */
  saveSSO(config: any): Observable<any> {
    return this.api.post('/admin/sso/config', config);
  }

  /**
   * Test SSO connection
   */
  testSSO(config: any): Observable<any> {
    return this.api.post('/admin/sso/test', config);
  }

  /**
   * Get LDAP configuration
   */
  getLDAP(): Observable<any> {
    return this.api.get('/admin/ldap/config');
  }

  /**
   * Save LDAP configuration
   */
  saveLDAP(config: any): Observable<any> {
    return this.api.post('/admin/ldap/config', config);
  }

  /**
   * Test LDAP connection
   */
  testLDAP(config: any): Observable<any> {
    return this.api.post('/admin/ldap/test', config);
  }
}
