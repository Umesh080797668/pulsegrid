import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-audit-export',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './audit-export.html',
  styleUrl: './audit-export.scss',
})
export class AuditExport {
  @Output() export = new EventEmitter<'csv' | 'pdf' | 'json'>();

  exportAs(format: 'csv' | 'pdf' | 'json') {
    this.export.emit(format);
  }
}
