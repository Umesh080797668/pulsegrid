import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import * as ComplianceActions from '../../../core/store/actions/compliance.actions';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-compliance-policies',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './compliance-policies.html',
  styleUrl: './compliance-policies.scss',
})
export class CompliancePolicies implements OnInit {
  policies$;
  drafts: Record<string, string> = {};

  constructor(private store: Store) {
    this.policies$ = this.store.select((s: any) => s.compliance?.policies || []);
  }

  ngOnInit(): void {
    this.store.dispatch(ComplianceActions.loadCompliance());
  }

  updatePolicy(policy: any) {
    const level = this.drafts[policy.id] || policy.level || policy.status;
    this.store.dispatch(
      ComplianceActions.updateCompliancePolicy({
        policyId: policy.id,
        policy: { ...policy, level },
      })
    );
  }
}
