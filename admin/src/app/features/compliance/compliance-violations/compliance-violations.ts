import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import * as ComplianceActions from '../../../core/store/actions/compliance.actions';

@Component({
  selector: 'app-compliance-violations',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './compliance-violations.html',
  styleUrl: './compliance-violations.scss',
})
export class ComplianceViolations implements OnInit {
  violations$;

  constructor(private store: Store) {
    this.violations$ = this.store.select((s: any) => s.compliance?.violations || []);
  }

  ngOnInit(): void {
    this.store.dispatch(ComplianceActions.loadCompliance());
  }
}
