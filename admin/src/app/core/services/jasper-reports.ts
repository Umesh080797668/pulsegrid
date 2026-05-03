import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Api } from './api';

@Injectable({
  providedIn: 'root',
})
export class JasperReportsService {
  constructor(private api: Api, private http: HttpClient) {}

  getTemplates(): Observable<any> {
    return this.api.get('/reports/jasper/templates');
  }

  buildReport(payload: any): Observable<any> {
    return this.api.post('/reports/jasper/build', payload);
  }

  previewReport(payload: any): Observable<any> {
    return this.api.post('/reports/jasper/preview', payload);
  }

  generateReport(payload: any): Observable<any> {
    return this.api.post('/reports/jasper/generate', payload);
  }

  downloadReport(reportId: string, format: 'pdf' | 'csv' | 'xlsx'): Observable<Blob> {
    return this.http.get(`/api/reports/jasper/${reportId}/download?format=${format}`, {
      responseType: 'blob',
    });
  }
}
