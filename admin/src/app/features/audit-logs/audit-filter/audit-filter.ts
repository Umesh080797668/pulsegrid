import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuditFilters } from '../../../core/store/app.state';

@Component({
  selector: 'app-audit-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './audit-filter.html',
  styleUrl: './audit-filter.scss',
})
export class AuditFilter {
  @Output() apply = new EventEmitter<AuditFilters>();
  @Output() clear = new EventEmitter<void>();

  filters: AuditFilters = {};

  applyFilters() {
    this.apply.emit({ ...this.filters });
  }

  clearFilters() {
    this.filters = {};
    this.clear.emit();
  }
}
