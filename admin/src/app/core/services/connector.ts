import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Api } from './api';

@Injectable({
  providedIn: 'root',
})
export class Connector {
  constructor(private api: Api, private http: HttpClient) {}

  /**
   * Get all connectors
   */
  getConnectors(): Observable<any> {
    return this.api.get('/connectors');
  }

  /**
   * Get connector by ID
   */
  getConnectorById(connectorId: string): Observable<any> {
    return this.api.get(`/connectors/${connectorId}`);
  }

  /**
   * Get allowlist
   */
  getAllowlist(): Observable<any> {
    return this.api.get('/connectors/allowlist');
  }

  /**
   * Get blocklist
   */
  getBlocklist(): Observable<any> {
    return this.api.get('/connectors/blocklist');
  }

  /**
   * Add connector to allowlist
   */
  addToAllowlist(connectorId: string): Observable<any> {
    return this.api.post('/connectors/allowlist', { connectorId });
  }

  /**
   * Add connector to blocklist
   */
  addToBlocklist(connectorId: string): Observable<any> {
    return this.api.post('/connectors/blocklist', { connectorId });
  }

  /**
   * Remove from allowlist
   */
  removeFromAllowlist(connectorId: string): Observable<any> {
    return this.api.delete(`/connectors/allowlist/${connectorId}`);
  }

  /**
   * Remove from blocklist
   */
  removeFromBlocklist(connectorId: string): Observable<any> {
    return this.api.delete(`/connectors/blocklist/${connectorId}`);
  }

  /**
   * Update connector config
   */
  updateConfig(connectorId: string, config: any): Observable<any> {
    return this.api.put(`/connectors/${connectorId}/config`, config);
  }

  /**
   * Test connector
   */
  testConnector(connectorId: string): Observable<any> {
    return this.api.post(`/connectors/${connectorId}/test`, {});
  }

  /**
   * Deploy connector
   */
  deployConnector(connectorId: string): Observable<any> {
    return this.api.post(`/connectors/${connectorId}/deploy`, {});
  }
}
