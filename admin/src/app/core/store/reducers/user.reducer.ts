import { createReducer, on } from '@ngrx/store';
import { UserState, PaginationState } from '../app.state';
import * as UserActions from '../actions/user.actions';

const initialPaginationState: PaginationState = {
  pageIndex: 0,
  pageSize: 10,
  total: 0,
};

const initialState: UserState = {
  users: [],
  roles: [],
  selectedUser: null,
  loading: false,
  error: null,
  pagination: initialPaginationState,
};

export const userReducer = createReducer(
  initialState,
  on(UserActions.loadUsers, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(UserActions.loadUsersSuccess, (state, { users, total }) => ({
    ...state,
    users,
    loading: false,
    pagination: { ...state.pagination, total },
  })),
  on(UserActions.loadUsersFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(UserActions.selectUser, (state, { userId }) => ({
    ...state,
    selectedUser: state.users.find((u) => u.id === userId) || null,
  })),
  on(UserActions.loadRolesSuccess, (state, { roles }) => ({
    ...state,
    roles,
  })),
  on(UserActions.createUser, (state, { user }) => ({
    ...state,
    users: [...state.users, user],
  })),
  on(UserActions.updateUser, (state, { userId, user }) => ({
    ...state,
    users: state.users.map((u) => (u.id === userId ? user : u)),
  })),
  on(UserActions.deleteUser, (state, { userId }) => ({
    ...state,
    users: state.users.filter((u) => u.id !== userId),
  }))
);
