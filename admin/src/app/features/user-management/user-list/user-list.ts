import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { MatTableModule } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableDataSource } from '@angular/material/table';
import * as UserActions from '../../../core/store/actions/user.actions';
import {
  selectAllUsers,
  selectAllRoles,
  selectUserLoading,
  selectUserPagination,
} from '../../../core/store/selectors/user.selectors';
import { UserForm } from '../user-form/user-form';
import { RoleForm } from '../role-form/role-form';

@Component({
  selector: 'app-user-list',
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
  templateUrl: './user-list.html',
  styleUrl: './user-list.scss',
})
export class UserList implements OnInit {
  users$: Observable<any[]>;
  roles$: Observable<any[]>;
  loading$: Observable<boolean>;
  pagination$: Observable<any>;
  dataSource = new MatTableDataSource<any>([]);

  displayedColumns = ['id', 'name', 'email', 'roles', 'actions'];

  @ViewChild(MatPaginator) paginator: MatPaginator | null = null;

  constructor(private store: Store, private dialog: MatDialog) {
    this.users$ = this.store.select(selectAllUsers);
    this.roles$ = this.store.select(selectAllRoles);
    this.loading$ = this.store.select(selectUserLoading);
    this.pagination$ = this.store.select(selectUserPagination);
  }

  ngOnInit(): void {
    this.store.dispatch(UserActions.loadUsers({ page: 0, size: 25 }));
    this.store.dispatch(UserActions.loadRoles());

    this.users$.subscribe((users) => {
      this.dataSource.data = users || [];
      if (this.paginator) {
        this.dataSource.paginator = this.paginator;
      }
    });
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  onPageChange(event: any) {
    this.store.dispatch(
      UserActions.loadUsers({ page: event.pageIndex, size: event.pageSize })
    );
  }

  openCreateUser() {
    const ref = this.dialog.open(UserForm, {
      width: '560px',
      data: { user: null },
    });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.store.dispatch(UserActions.createUser({ user: result }));
      }
    });
  }

  openEditUser(user: any) {
    const ref = this.dialog.open(UserForm, {
      width: '560px',
      data: { user },
    });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.store.dispatch(
          UserActions.updateUser({ userId: user.id, user: result })
        );
      }
    });
  }

  deleteUser(userId: string) {
    if (!confirm('Delete this user?')) return;
    this.store.dispatch(UserActions.deleteUser({ userId }));
  }

  openCreateRole() {
    const ref = this.dialog.open(RoleForm, {
      width: '520px',
      data: { role: null },
    });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.store.dispatch(UserActions.createRole({ role: result }));
      }
    });
  }

  openEditRole(role: any) {
    const ref = this.dialog.open(RoleForm, {
      width: '520px',
      data: { role },
    });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.store.dispatch(
          UserActions.updateRole({ roleId: role.id, role: result })
        );
      }
    });
  }

  deleteRole(roleId: string) {
    if (!confirm('Delete this role?')) return;
    this.store.dispatch(UserActions.deleteRole({ roleId }));
  }
}
