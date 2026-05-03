import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import * as ReportsActions from '../../../core/store/actions/reports.actions';
import { selectPreview, selectGeneratedReport, selectReportsLoading } from '../../../core/store/selectors/reports.selectors';

@Component({
  selector: 'app-report-preview',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatTableModule, MatButtonModule, MatIconModule, MatChipsModule],
  templateUrl: './report-preview.html',
  styleUrl: './report-preview.scss',
})
export class ReportPreview implements OnInit {
  private store = inject(Store);

  preview$: Observable<any | null>;
  generated$: Observable<any | null>;
  loading$: Observable<boolean>;

  displayedColumns = ['key', 'value'];

  constructor() {
    this.preview$ = this.store.select(selectPreview);
    this.generated$ = this.store.select(selectGeneratedReport);
    this.loading$ = this.store.select(selectReportsLoading);
  }

  ngOnInit(): void {
    this.store.dispatch(ReportsActions.loadTemplates());
  }

  download(reportId: string, format: 'pdf' | 'csv' | 'xlsx'): void {
    this.store.dispatch(ReportsActions.downloadReport({ reportId, format }));
  }

  clearMessage(): void {
    this.store.dispatch(ReportsActions.clearReportMessage());
  }
}
