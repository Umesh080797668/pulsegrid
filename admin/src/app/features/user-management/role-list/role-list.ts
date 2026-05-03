import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import * as UserActions from '../../../core/store/actions/user.actions';
import { selectAllRoles } from '../../../core/store/selectors/user.selectors';
import { RoleForm } from '../role-form/role-form';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatDialogModule],
  templateUrl: './role-list.html',
  styleUrl: './role-list.scss',
})
export class RoleList implements OnInit {
  roles$: Observable<any[]>;

  constructor(private store: Store, private dialog: MatDialog) {
    this.roles$ = this.store.select(selectAllRoles);
  }

  ngOnInit(): void {
    this.store.dispatch(UserActions.loadRoles());
  }

  openCreate() {
    const ref = this.dialog.open(RoleForm, { width: '520px', data: { role: null } });
    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.store.dispatch(UserActions.createRole({ role: result }));
      }
    });
  }

  openEdit(role: any) {
    const ref = this.dialog.open(RoleForm, { width: '520px', data: { role } });
    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.store.dispatch(UserActions.updateRole({ roleId: role.id, role: result }));
      }
    });
  }

  deleteRole(roleId: string) {
    if (!confirm('Delete this role?')) return;
    this.store.dispatch(UserActions.deleteRole({ roleId }));
  }
}
