import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Api } from './api';

@Injectable({
  providedIn: 'root',
})
export class Audit {
  constructor(private api: Api, private http: HttpClient) {}

  /**
   * Get audit logs with filters
   */
  getAuditLogs(
    page = 0,
    pageSize = 20,
    filters?: any
  ): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', pageSize.toString());

    if (filters) {
      if (filters.action) params = params.set('action', filters.action);
      if (filters.user) params = params.set('user', filters.user);
      if (filters.resource) params = params.set('resource', filters.resource);
      if (filters.startDate) params = params.set('startDate', filters.startDate);
      if (filters.endDate) params = params.set('endDate', filters.endDate);
    }

    return this.api.get('/audit/logs', params);
  }

  /**
   * Export audit logs
   */
  exportAuditLogs(format: 'csv' | 'pdf' | 'json'): Observable<Blob> {
    return this.http.get(
      `/api/audit/logs/export?format=${format}`,
      { responseType: 'blob' }
    );
  }

  /**
   * Get audit log by ID
   */
  getAuditLogById(logId: string): Observable<any> {
    return this.api.get(`/audit/logs/${logId}`);
  }
}
