import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Api } from './api';

@Injectable({
  providedIn: 'root',
})
export class Billing {
  constructor(private api: Api, private http: HttpClient) {}

  /**
   * Get all invoices
   */
  getInvoices(page = 0, pageSize = 10): Observable<any> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', pageSize.toString());
    return this.api.get('/billing/invoices', params);
  }

  /**
   * Get invoice by ID
   */
  getInvoiceById(invoiceId: string): Observable<any> {
    return this.api.get(`/billing/invoices/${invoiceId}`);
  }

  /**
   * Download invoice as PDF
   */
  downloadInvoice(invoiceId: string): Observable<Blob> {
    return this.http.get(`/api/billing/invoices/${invoiceId}/download`, {
      responseType: 'blob',
    });
  }

  /**
   * Generate invoice
   */
  generateInvoice(billingPeriod: string): Observable<any> {
    return this.api.post('/billing/invoices/generate', { billingPeriod });
  }

  /**
   * Get subscriptions
   */
  getSubscriptions(): Observable<any> {
    return this.api.get('/billing/subscriptions');
  }

  /**
   * Update subscription
   */
  updateSubscription(subscriptionId: string, plan: string): Observable<any> {
    return this.api.put(`/billing/subscriptions/${subscriptionId}`, { plan });
  }

  /**
   * Cancel subscription
   */
  cancelSubscription(subscriptionId: string): Observable<any> {
    return this.api.post(
      `/billing/subscriptions/${subscriptionId}/cancel`,
      {}
    );
  }
}
