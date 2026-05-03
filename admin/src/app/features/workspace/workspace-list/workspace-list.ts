import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Observable, firstValueFrom } from 'rxjs';
import * as WorkspaceActions from '../../../core/store/actions/workspace.actions';
import { WorkspaceForm } from '../workspace-form/workspace-form';
import { MatTableDataSource } from '@angular/material/table';
import { Api } from '../../../core/services/api';

@Component({
  selector: 'app-workspace-list',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './workspace-list.html',
  styleUrl: './workspace-list.scss',
})
export class WorkspaceList implements OnInit {
  workspaces$: Observable<any[]>;
  dataSource = new MatTableDataSource<any>([]);
  displayedColumns = ['name', 'id', 'owner', 'createdAt', 'actions'];
  loading = false;

  @ViewChild(MatPaginator) paginator: MatPaginator | null = null;

  constructor(private store: Store, private dialog: MatDialog, private api: Api) {
    this.workspaces$ = this.store.select((s: any) => s.workspaces?.workspaces || []);
  }

  ngOnInit(): void {
    this.load();
    this.workspaces$.subscribe((items) => {
      this.dataSource.data = items || [];
      if (this.paginator) {
        this.dataSource.paginator = this.paginator;
      }
    });
  }

  load() {
    this.loading = true;
    this.store.dispatch(WorkspaceActions.loadWorkspaces());
    // wait for effect to populate store; toggle loading off after a short delay or on error from effect
    setTimeout(() => (this.loading = false), 600);
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  openCreate() {
    const ref = this.dialog.open(WorkspaceForm, { data: null, width: '520px' });
    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.createWorkspace(result);
      }
    });
  }

  openEdit(workspace: any) {
    const ref = this.dialog.open(WorkspaceForm, { data: workspace, width: '520px' });
    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.updateWorkspace(workspace.id, result);
      }
    });
  }

  async createWorkspace(payload: any) {
    this.loading = true;
    try {
      await firstValueFrom(this.api.post('/workspaces', payload));
      this.load();
    } catch (err) {
      console.error('create workspace failed', err);
    } finally {
      this.loading = false;
    }
  }

  async updateWorkspace(id: string, payload: any) {
    this.loading = true;
    try {
      await firstValueFrom(this.api.put(`/workspaces/${encodeURIComponent(id)}`, payload));
      this.load();
    } catch (err) {
      console.error('update workspace failed', err);
    } finally {
      this.loading = false;
    }
  }

  async deleteWorkspace(id: string) {
    if (!confirm('Delete this workspace?')) return;
    this.loading = true;
    try {
      await firstValueFrom(this.api.delete(`/workspaces/${encodeURIComponent(id)}`));
      this.load();
    } catch (err) {
      console.error('delete workspace failed', err);
    } finally {
      this.loading = false;
    }
  }
}
