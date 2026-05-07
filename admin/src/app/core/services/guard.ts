import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  GuardAlert,
  GuardFilters,
  GuardIndexStatus,
  GuardMaintenanceState,
} from '../store/app.state';

export interface GuardAlertListResponse {
  alerts: GuardAlert[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable({
  providedIn: 'root',
})
export class Guard {
  private readonly apiUrl = '/guard';

  constructor(private http: HttpClient) {}

  getAlerts(filters: GuardFilters = {}): Observable<GuardAlertListResponse> {
    let params = new HttpParams();

    if (filters.tenant_id) {
      params = params.set('tenant_id', filters.tenant_id);
    }
    if (filters.status) {
      params = params.set('status', filters.status);
    }
    if (filters.severity) {
      params = params.set('severity', filters.severity);
    }

    params = params.set('limit', String(filters.limit ?? 20));
    params = params.set('offset', String(filters.offset ?? 0));

    return this.http.get<GuardAlertListResponse>(`${this.apiUrl}/alerts`, { params });
  }

  getAlert(id: string): Observable<GuardAlert> {
    return this.http.get<GuardAlert>(`${this.apiUrl}/alerts/${id}`);
  }

  acknowledgeAlert(id: string, actorUserId?: string): Observable<GuardAlert> {
    return this.http.patch<GuardAlert>(`${this.apiUrl}/alerts/${id}/acknowledge`, {
      actor_user_id: actorUserId,
    });
  }

  resolveAlert(id: string, actorUserId?: string): Observable<GuardAlert> {
    return this.http.patch<GuardAlert>(`${this.apiUrl}/alerts/${id}/resolve`, {
      actor_user_id: actorUserId,
    });
  }

  dismissAlert(id: string, actorUserId?: string): Observable<GuardAlert> {
    return this.http.patch<GuardAlert>(`${this.apiUrl}/alerts/${id}/dismiss`, {
      actor_user_id: actorUserId,
    });
  }

  createGithubIssue(
    id: string,
    owner?: string,
    repo?: string,
    baseBranch?: string,
  ): Observable<{ status: string; issueUrl?: string; branchUrl?: string }> {
    return this.http.post<{ status: string; issueUrl?: string; branchUrl?: string }>(
      `${this.apiUrl}/alerts/${id}/github`,
      { owner, repo, base_branch: baseBranch },
    );
  }

  getMaintenanceState(tenantId?: string): Observable<GuardMaintenanceState> {
    let params = new HttpParams();

    if (tenantId) {
      params = params.set('tenant_id', tenantId);
    }

    return this.http.get<GuardMaintenanceState>(`${this.apiUrl}/maintenance`, { params });
  }

  clearMaintenance(
    tenantId?: string,
    actorUserId?: string,
    reason?: string,
  ): Observable<{ status: string; cleared_keys: number }> {
    return this.http.request<{ status: string; cleared_keys: number }>('delete', `${this.apiUrl}/maintenance`, {
      body: {
        tenant_id: tenantId,
        actor_user_id: actorUserId,
        reason,
      },
    });
  }

  getIndexStatus(): Observable<GuardIndexStatus> {
    return this.http.get<GuardIndexStatus>(`${this.apiUrl}/index/status`);
  }

  rebuildIndex(requestedBy?: string, reason?: string): Observable<{ status: string; requested_at: string }> {
    return this.http.post<{ status: string; requested_at: string }>(`${this.apiUrl}/index/rebuild`, {
      requested_by: requestedBy,
      reason,
    });
  }
}