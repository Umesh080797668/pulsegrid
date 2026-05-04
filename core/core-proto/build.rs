fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=proto/pulsecore.proto");
    println!("cargo:rerun-if-changed=proto/guard.proto");
    tonic_build::configure().compile_protos(
        &["proto/pulsecore.proto", "proto/guard.proto"],
        &["proto"],
    )?;
    Ok(())
}
