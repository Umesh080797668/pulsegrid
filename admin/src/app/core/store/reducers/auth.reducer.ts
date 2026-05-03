import { createReducer, on } from '@ngrx/store';
import { AuthState } from '../app.state';
import * as AuthActions from '../actions/user.actions';

const initialState: AuthState = {
  user: null,
  token: null,
  loading: false,
  error: null,
  authenticated: false,
};

export const authReducer = createReducer(
  initialState,
  on(AuthActions.loadUsers, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(AuthActions.loadUsersSuccess, (state) => ({
    ...state,
    loading: false,
  })),
  on(AuthActions.loadUsersFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  }))
);
