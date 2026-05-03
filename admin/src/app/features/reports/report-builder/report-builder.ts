import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import * as ReportsActions from '../../../core/store/actions/reports.actions';
import { selectTemplates, selectDraft, selectReportsLoading, selectReportsMessage } from '../../../core/store/selectors/reports.selectors';

@Component({
  selector: 'app-report-builder',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
  ],
  templateUrl: './report-builder.html',
  styleUrl: './report-builder.scss',
})
export class ReportBuilder implements OnInit {
  private fb = inject(FormBuilder);
  private store = inject(Store);

  templates$: Observable<any[]>;
  draft$: Observable<any | null>;
  loading$: Observable<boolean>;
  message$: Observable<string>;

  reportForm = this.fb.group({
    templateId: ['', Validators.required],
    reportName: ['', Validators.required],
    outputFormat: ['pdf', Validators.required],
    parameters: ['{}', Validators.required],
  });

  constructor() {
    this.templates$ = this.store.select(selectTemplates);
    this.draft$ = this.store.select(selectDraft);
    this.loading$ = this.store.select(selectReportsLoading);
    this.message$ = this.store.select(selectReportsMessage);
  }

  ngOnInit(): void {
    this.store.dispatch(ReportsActions.loadTemplates());
  }

  buildDraft(): void {
    if (!this.reportForm.valid) return;
    this.store.dispatch(ReportsActions.buildReport({ payload: this.reportForm.value }));
  }

  previewReport(): void {
    if (!this.reportForm.valid) return;
    this.store.dispatch(ReportsActions.previewReport({ payload: this.reportForm.value }));
  }

  generateReport(): void {
    if (!this.reportForm.valid) return;
    this.store.dispatch(ReportsActions.generateReport({ payload: this.reportForm.value }));
  }
}
