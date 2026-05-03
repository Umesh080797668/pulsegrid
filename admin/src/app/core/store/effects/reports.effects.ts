import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import * as ReportsActions from '../actions/reports.actions';
import { JasperReportsService } from '../../services/jasper-reports';
import { catchError, map, mergeMap, of, tap } from 'rxjs';

@Injectable()
export class ReportsEffects {
  private actions$ = inject(Actions);
  private reportsService = inject(JasperReportsService);

  loadTemplates$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReportsActions.loadTemplates),
      mergeMap(() =>
        this.reportsService.getTemplates().pipe(
          map((res: any) => ReportsActions.loadTemplatesSuccess({ templates: res.templates || res || [] })),
          catchError((error) => of(ReportsActions.loadTemplatesFailure({ error: error?.message || 'Failed to load templates' })))
        )
      )
    )
  );

  buildReport$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReportsActions.buildReport),
      mergeMap(({ payload }) =>
        this.reportsService.buildReport(payload).pipe(
          map((draft: any) => ReportsActions.buildReportSuccess({ draft })),
          catchError((error) => of(ReportsActions.buildReportFailure({ error: error?.message || 'Failed to build report' })))
        )
      )
    )
  );

  previewReport$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReportsActions.previewReport),
      mergeMap(({ payload }) =>
        this.reportsService.previewReport(payload).pipe(
          map((preview: any) => ReportsActions.previewReportSuccess({ preview })),
          catchError((error) => of(ReportsActions.previewReportFailure({ error: error?.message || 'Failed to preview report' })))
        )
      )
    )
  );

  generateReport$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ReportsActions.generateReport),
      mergeMap(({ payload }) =>
        this.reportsService.generateReport(payload).pipe(
          map((generated: any) => ReportsActions.generateReportSuccess({ generated })),
          catchError((error) => of(ReportsActions.generateReportFailure({ error: error?.message || 'Failed to generate report' })))
        )
      )
    )
  );

  downloadReport$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ReportsActions.downloadReport),
        mergeMap(({ reportId, format }) =>
          this.reportsService.downloadReport(reportId, format).pipe(
            tap((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `jasper-report-${reportId}.${format}`;
              a.click();
              URL.revokeObjectURL(url);
            }),
            catchError(() => of(null))
          )
        )
      ),
    { dispatch: false }
  );
}
