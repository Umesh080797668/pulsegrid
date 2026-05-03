import { createReducer, on } from '@ngrx/store';
import { ComplianceState } from '../app.state';
import * as ComplianceActions from '../actions/compliance.actions';

const initialState: ComplianceState = {
  policies: [],
  violations: [],
  metrics: {
    overallScore: 0,
    policiesChecked: 0,
    violationsFound: 0,
    lastAudit: new Date(),
  },
  loading: false,
  error: null,
};

export const complianceReducer = createReducer(
  initialState,
  on(ComplianceActions.loadCompliance, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),
  on(ComplianceActions.loadComplianceSuccess, (state, { policies, violations, metrics }) => ({
    ...state,
    policies,
    violations,
    metrics,
    loading: false,
  })),
  on(ComplianceActions.loadComplianceFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),
  on(ComplianceActions.runComplianceAudit, (state) => ({
    ...state,
    loading: true,
  }))
);
