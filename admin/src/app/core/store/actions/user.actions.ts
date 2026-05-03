import { createAction, props } from '@ngrx/store';

export const loadUsers = createAction(
  '[User] Load Users',
  props<{ page?: number; size?: number }>()
);

export const loadUsersSuccess = createAction(
  '[User] Load Users Success',
  props<{ users: any[]; total: number }>()
);

export const loadUsersFailure = createAction(
  '[User] Load Users Failure',
  props<{ error: string }>()
);

export const selectUser = createAction(
  '[User] Select User',
  props<{ userId: string }>()
);

export const createUser = createAction(
  '[User] Create User',
  props<{ user: any }>()
);

export const updateUser = createAction(
  '[User] Update User',
  props<{ userId: string; user: any }>()
);

export const deleteUser = createAction(
  '[User] Delete User',
  props<{ userId: string }>()
);

export const assignRole = createAction(
  '[User] Assign Role',
  props<{ userId: string; roleId: string }>()
);

export const loadRoles = createAction(
  '[User] Load Roles'
);

export const loadRolesSuccess = createAction(
  '[User] Load Roles Success',
  props<{ roles: any[] }>()
);

export const loadRolesFailure = createAction(
  '[User] Load Roles Failure',
  props<{ error: string }>()
);

export const createRole = createAction(
  '[User] Create Role',
  props<{ role: any }>()
);

export const updateRole = createAction(
  '[User] Update Role',
  props<{ roleId: string; role: any }>()
);

export const deleteRole = createAction(
  '[User] Delete Role',
  props<{ roleId: string }>()
);
