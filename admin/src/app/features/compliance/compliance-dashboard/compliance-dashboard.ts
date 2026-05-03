import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import * as ComplianceActions from '../../../core/store/actions/compliance.actions';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-compliance-dashboard',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './compliance-dashboard.html',
  styleUrl: './compliance-dashboard.scss',
})
export class ComplianceDashboard implements OnInit {
  metrics$;
  policies$;
  violations$;

  constructor(private store: Store) {
    this.metrics$ = this.store.select((s: any) => s.compliance?.metrics || {});
    this.policies$ = this.store.select((s: any) => s.compliance?.policies || []);
    this.violations$ = this.store.select((s: any) => s.compliance?.violations || []);
  }

  ngOnInit(): void {
    this.store.dispatch(ComplianceActions.loadCompliance());
  }

  runAudit() {
    this.store.dispatch(ComplianceActions.runComplianceAudit());
  }
}
