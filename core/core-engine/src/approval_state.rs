// Centralized approval/circuit state constants
pub const PENDING_APPROVAL: &str = "pending_approval";
pub const PENDING_APPROVAL_APPROVED: &str = "pending_approval_approved";
pub const PENDING_APPROVAL_REJECTED: &str = "pending_approval_rejected";
pub const APPROVAL_TIMEOUT: &str = "approval_timeout";
pub const PAUSED_CIRCUIT_OPEN: &str = "paused_circuit_open";
pub const NONE: &str = "none";

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn constants_present() {
		assert_eq!(PENDING_APPROVAL, "pending_approval");
		assert_eq!(PENDING_APPROVAL_APPROVED, "pending_approval_approved");
		assert_eq!(PENDING_APPROVAL_REJECTED, "pending_approval_rejected");
		assert_eq!(APPROVAL_TIMEOUT, "approval_timeout");
		assert_eq!(PAUSED_CIRCUIT_OPEN, "paused_circuit_open");
		assert_eq!(NONE, "none");
	}
}
