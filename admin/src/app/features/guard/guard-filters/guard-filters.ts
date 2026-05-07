import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { GuardAlertStatus, GuardFilters, GuardSeverity } from '../../../core/store/app.state';

@Component({
  selector: 'app-guard-filters',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule],
  templateUrl: './guard-filters.html',
  styleUrl: './guard-filters.scss',
})
export class GuardFiltersComponent {
  private readonly fb = new FormBuilder();

  @Output() apply = new EventEmitter<GuardFilters>();
  @Output() clear = new EventEmitter<void>();

  readonly severityOptions: Array<{ value: GuardSeverity; label: string }> = [
    { value: 'warning', label: 'Warning' },
    { value: 'error', label: 'Error' },
    { value: 'critical', label: 'Critical' },
  ];

  readonly statusOptions: Array<{ value: GuardAlertStatus; label: string }> = [
    { value: 'open', label: 'Open' },
    { value: 'acknowledged', label: 'Acknowledged' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'dismissed', label: 'Dismissed' },
  ];

  readonly form = this.fb.group({
    tenant_id: [''],
    severity: [''],
    status: [''],
  });

  @Input()
  set filters(filters: GuardFilters | null) {
    if (!filters) {
      return;
    }

    this.form.patchValue({
      tenant_id: filters.tenant_id || '',
      severity: filters.severity || '',
      status: filters.status || '',
    }, { emitEvent: false });
  }

  applyFilters(): void {
    const raw = this.form.getRawValue();
    this.apply.emit({
      tenant_id: raw.tenant_id?.trim() || undefined,
      severity: (raw.severity as GuardSeverity) || undefined,
      status: (raw.status as GuardAlertStatus) || undefined,
    });
  }

  clearFilters(): void {
    this.form.reset({ tenant_id: '', severity: '', status: '' });
    this.clear.emit();
  }
}