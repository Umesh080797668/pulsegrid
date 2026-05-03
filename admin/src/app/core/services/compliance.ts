import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Api } from './api';

@Injectable({
  providedIn: 'root',
})
export class Compliance {
  constructor(private api: Api, private http: HttpClient) {}

  /**
   * Get compliance dashboard
   */
  getDashboard(): Observable<any> {
    return this.api.get('/compliance/dashboard');
  }

  /**
   * Get compliance policies
   */
  getPolicies(): Observable<any> {
    return this.api.get('/compliance/policies');
  }

  /**
   * Get compliance violations
   */
  getViolations(): Observable<any> {
    return this.api.get('/compliance/violations');
  }

  /**
   * Get compliance metrics
   */
  getMetrics(): Observable<any> {
    return this.api.get('/compliance/metrics');
  }

  /**
   * Run compliance audit
   */
  runAudit(): Observable<any> {
    return this.api.post('/compliance/audit/run', {});
  }

  /**
   * Get compliance reports
   */
  getReports(): Observable<any> {
    return this.api.get('/compliance/reports');
  }

  /**
   * Export compliance report
   */
  exportReport(reportId: string, format: 'pdf' | 'csv'): Observable<Blob> {
    return this.http.get(
      `/api/compliance/reports/${reportId}/export?format=${format}`,
      { responseType: 'blob' }
    );
  }

  /**
   * Update compliance policy
   */
  updatePolicy(policyId: string, policy: any): Observable<any> {
    return this.api.put(`/compliance/policies/${policyId}`, policy);
  }

  /**
   * Schedule compliance audit
   */
  scheduleAudit(frequency: string, time: string): Observable<any> {
    return this.api.post('/compliance/audit/schedule', { frequency, time });
  }
}
