import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { map, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { GuardAlertCardComponent } from '../guard-alert-card/guard-alert-card';
import { GuardFiltersComponent } from '../guard-filters/guard-filters';
import { GuardAlert, GuardFilters, GuardMaintenanceResult, GuardResearchResult, GuardSeverity, GuardTriageResult } from '../../../core/store/app.state';
import * as GuardActions from '../../../core/store/actions/guard.actions';
import {
  selectGuardAlerts,
  selectGuardDetailLoading,
  selectGuardError,
  selectGuardFilters,
  selectGuardIndexStatus,
  selectGuardLoading,
  selectGuardMaintenance,
  selectGuardPagination,
  selectGuardSelectedAlert,
} from '../../../core/store/selectors/guard.selectors';

@Component({
  selector: 'app-guard-page',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    GuardAlertCardComponent,
    GuardFiltersComponent,
  ],
  templateUrl: './guard-page.html',
  styleUrl: './guard-page.scss',
})
export class GuardPageComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly store = inject(Store);

  readonly alerts$ = this.store.select(selectGuardAlerts);
  readonly selectedAlert$ = this.store.select(selectGuardSelectedAlert);
  readonly loading$ = this.store.select(selectGuardLoading);
  readonly detailLoading$ = this.store.select(selectGuardDetailLoading);
  readonly error$ = this.store.select(selectGuardError);
  readonly filters$ = this.store.select(selectGuardFilters);
  readonly pagination$ = this.store.select(selectGuardPagination);
  readonly maintenance$ = this.store.select(selectGuardMaintenance);
  readonly indexStatus$ = this.store.select(selectGuardIndexStatus);

  readonly summary$ = this.alerts$.pipe(
    map((alerts) => {
      const total = alerts.length;
      const open = alerts.filter((alert) => alert.status === 'open').length;
      const acknowledged = alerts.filter((alert) => alert.status === 'acknowledged').length;
      const resolved = alerts.filter((alert) => alert.status === 'resolved').length;
      const critical = alerts.filter((alert) => String(alert.severity).toLowerCase() === 'critical').length;
      return { total, open, acknowledged, resolved, critical };
    }),
  );

  readonly severityColor = (severity: GuardSeverity | string): string => String(severity || 'error').toLowerCase();

  ngOnInit(): void {
    this.store.dispatch(GuardActions.loadGuardDashboard({ filters: { limit: 20, offset: 0 } }));

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const alertId = params.get('id');
      if (alertId) {
        this.store.dispatch(GuardActions.selectGuardAlert({ id: alertId }));
        this.store.dispatch(GuardActions.loadGuardAlert({ id: alertId }));
      } else {
        this.store.dispatch(GuardActions.selectGuardAlert({ id: null }));
      }
    });
  }

  trackByAlertId(_: number, alert: GuardAlert): string {
    return alert.id;
  }

  onApplyFilters(filters: GuardFilters): void {
    this.store.dispatch(
      GuardActions.setGuardFilters({
        filters: {
          ...filters,
          limit: 20,
          offset: 0,
        },
      }),
    );
  }

  onClearFilters(): void {
    this.store.dispatch(GuardActions.clearGuardFilters());
  }

  onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.filters$.pipe(take(1)).subscribe((filters) => {
      this.store.dispatch(
        GuardActions.setGuardFilters({
          filters: {
            ...filters,
            limit: event.pageSize,
            offset: event.pageIndex * event.pageSize,
          },
        }),
      );
    });
  }

  onSelectAlert(alertId: string): void {
    this.router.navigate(['/admin/guard', alertId]);
    this.store.dispatch(GuardActions.selectGuardAlert({ id: alertId }));
    this.store.dispatch(GuardActions.loadGuardAlert({ id: alertId }));
  }

  onAcknowledgeAlert(alertId: string): void {
    this.store.dispatch(GuardActions.acknowledgeGuardAlert({ id: alertId }));
  }

  onResolveAlert(alertId: string): void {
    this.store.dispatch(GuardActions.resolveGuardAlert({ id: alertId }));
  }

  onDismissAlert(alertId: string): void {
    this.store.dispatch(GuardActions.dismissGuardAlert({ id: alertId }));
  }

  onCreateGithubIssue(alertId: string): void {
    this.store.dispatch(GuardActions.createGuardGithubIssue({ id: alertId }));
  }

  onReload(selectedTenantId?: string): void {
    this.filters$.pipe(take(1)).subscribe((filters) => {
      this.store.dispatch(
        GuardActions.loadGuardDashboard({
          filters: selectedTenantId ? { ...filters, tenant_id: selectedTenantId } : filters,
        }),
      );
    });
  }

  onClearMaintenance(tenantId?: string): void {
    this.store.dispatch(GuardActions.clearGuardMaintenance({ tenantId, reason: 'admin_review_panel' }));
  }

  onRebuildIndex(): void {
    this.store.dispatch(GuardActions.rebuildGuardIndex({ reason: 'admin_review_panel' }));
  }

  onBackToList(): void {
    this.router.navigate(['/admin/guard']);
    this.store.dispatch(GuardActions.selectGuardAlert({ id: null }));
  }

  formatMaintenanceScope(scope?: GuardMaintenanceResult | null): string {
    if (!scope) {
      return 'No maintenance actions were recorded.';
    }

    const flows = scope.pausedFlows?.length ? `${scope.pausedFlows.length} flow(s) paused` : 'No flows paused';
    return `${scope.scope.toUpperCase()} scope — ${flows}`;
  }

  formatResearchSummary(result?: GuardResearchResult | null): string {
    if (!result) {
      return 'No external research was attached to this alert.';
    }

    const sourceCount = result.sources?.length || 0;
    const cveCount = result.cve_ids?.length || 0;
    return `${sourceCount} source(s), ${cveCount} CVE reference(s)`;
  }

  formatDiagnosis(alert?: GuardAlert | null): GuardTriageResult | null {
    return alert?.ai_diagnosis ?? null;
  }

  openIssueUrl(alert?: GuardAlert | null): void {
    const url = alert?.github_issue_url;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}