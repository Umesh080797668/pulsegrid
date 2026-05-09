-- Normalize existing approval_state values to supported set
BEGIN;

-- Map legacy 'pending_approval_approved' and 'pending_approval_rejected' to 'none'
UPDATE flow_runs
SET approval_state = 'none'
WHERE approval_state IN ('pending_approval_approved', 'pending_approval_rejected');

-- For any unexpected values, NULL them so they don't violate constraints
UPDATE flow_runs
SET approval_state = NULL
WHERE approval_state IS NOT NULL
  AND approval_state NOT IN (
    'pending_approval',
    'pending_approval_approved',
    'pending_approval_rejected',
    'approval_timeout',
    'paused_circuit_open',
    'none'
  );

COMMIT;