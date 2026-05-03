import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import * as WorkspaceActions from '../../../core/store/actions/workspace.actions';
import { MatListModule } from '@angular/material/list';

@Component({
  selector: 'app-workspace-list',
  standalone: true,
  imports: [CommonModule, MatListModule],
  templateUrl: './workspace-list.html',
  styleUrl: './workspace-list.scss',
})
export class WorkspaceList implements OnInit {
  workspaces$: Observable<any[]>;

  constructor(private store: Store) {
    this.workspaces$ = this.store.select((s: any) => s.workspaces?.workspaces || []);
  }

  ngOnInit(): void {
    this.store.dispatch(WorkspaceActions.loadWorkspaces());
  }
}
