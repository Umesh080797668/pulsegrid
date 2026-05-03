import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import * as ComplianceActions from '../../../core/store/actions/compliance.actions';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-compliance-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './compliance-reports.html',
  styleUrl: './compliance-reports.scss',
})
export class ComplianceReports {
  reportId = '';
  frequency = 'weekly';
  time = '03:00';

  constructor(private store: Store) {}

  exportReport(format: 'pdf' | 'csv') {
    if (!this.reportId) return;
    this.store.dispatch(
      ComplianceActions.exportComplianceReport({
        reportId: this.reportId,
        format,
      })
    );
  }

  scheduleAudit() {
    this.store.dispatch(
      ComplianceActions.scheduleComplianceAudit({
        frequency: this.frequency,
        time: this.time,
      })
    );
  }
}
