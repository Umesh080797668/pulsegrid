import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as ComplianceActions from '../../../core/store/actions/compliance.actions';

@Component({
  selector: 'app-compliance-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './compliance-dashboard.html',
  styleUrl: './compliance-dashboard.scss',
})
export class ComplianceDashboard implements OnInit {
  metrics$: Observable<any>;

  constructor(private store: Store) {
    this.metrics$ = this.store.select((s: any) => s.compliance?.metrics || {});
  }

  ngOnInit(): void {
    this.store.dispatch(ComplianceActions.loadCompliance());
  }
}
