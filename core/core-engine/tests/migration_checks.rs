use std::fs;
use std::path::PathBuf;

#[test]
fn migration_has_allowed_approval_states() {
    let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    // file is under ../migrations relative to crate
    let migrations_dir = repo_root.join("migrations");
    let migration = migrations_dir.join("20260504_approval_and_circuit_breaker.sql");
    let data = fs::read_to_string(&migration).expect("Failed to read migration file");

    let expected = [
        "pending_approval",
        "pending_approval_approved",
        "pending_approval_rejected",
        "approval_timeout",
        "paused_circuit_open",
        "none",
    ];

    for s in expected.iter() {
        assert!(data.contains(s), "Migration should include state: {}", s);
    }
}
