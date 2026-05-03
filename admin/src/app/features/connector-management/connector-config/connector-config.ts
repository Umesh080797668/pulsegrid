import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as ConnectorActions from '../../../core/store/actions/connector.actions';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-connector-config',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSnackBarModule,
  ],
  templateUrl: './connector-config.html',
  styleUrl: './connector-config.scss',
})
export class ConnectorConfig implements OnInit {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private snackBar = inject(MatSnackBar);

  connectors$: Observable<any[]>;
  loading$: Observable<boolean>;
  error$: Observable<string | null>;

  configForm = this.fb.group({
    connectorId: ['', Validators.required],
    endpoint: ['', Validators.required],
    apiKey: [''],
    secret: [''],
    enabled: [true],
    retryCount: [3, [Validators.min(0), Validators.max(10)]],
    timeoutMs: [30000, [Validators.min(1000)]],
    metadata: [''],
  });

  constructor() {
    this.connectors$ = this.store.select((s: any) => s.connectors?.connectors || []);
    this.loading$ = this.store.select((s: any) => s.connectors?.loading || false);
    this.error$ = this.store.select((s: any) => s.connectors?.error || null);
  }

  ngOnInit(): void {
    this.store.dispatch(ConnectorActions.loadConnectors());
  }

  saveConfig(): void {
    if (this.configForm.valid) {
      const { connectorId, ...config } = this.configForm.value;
      this.store.dispatch(ConnectorActions.updateConnectorConfig({ connectorId: connectorId!, config }));
      this.snackBar.open('Connector configuration updated', 'Close', { duration: 3000 });
    }
  }

  testConnector(): void {
    const connectorId = this.configForm.value.connectorId;
    if (connectorId) {
      this.store.dispatch(ConnectorActions.testConnector({ connectorId }));
    }
  }

  deployConnector(): void {
    const connectorId = this.configForm.value.connectorId;
    if (connectorId) {
      this.store.dispatch(ConnectorActions.deployConnector({ connectorId }));
    }
  }

  reset(): void {
    this.configForm.reset({ enabled: true, retryCount: 3, timeoutMs: 30000 });
  }

  onConnectorChange(connectorId: string): void {
    this.connectors$.subscribe((connectors) => {
      const selected = connectors.find((c) => c.id === connectorId);
      if (selected?.config) {
        this.configForm.patchValue({
          endpoint: selected.config.endpoint || '',
          apiKey: selected.config.apiKey || '',
          secret: selected.config.secret || '',
          enabled: selected.config.enabled ?? true,
          retryCount: selected.config.retryCount ?? 3,
          timeoutMs: selected.config.timeoutMs ?? 30000,
          metadata: selected.config.metadata ? JSON.stringify(selected.config.metadata, null, 2) : '',
        });
      }
    }).unsubscribe();
  }
}
