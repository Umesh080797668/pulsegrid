import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { ReportBuilder } from '../report-builder/report-builder';
import { ReportPreview } from '../report-preview/report-preview';

@Component({
  selector: 'app-jasper-reports',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatTabsModule, ReportBuilder, ReportPreview],
  templateUrl: './jasper-reports.html',
  styleUrl: './jasper-reports.scss',
})
export class JasperReports {}
