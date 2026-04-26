use rhai::{Dynamic, Map, Scope};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use wasmtime::{Config as WasmConfig, Engine as WasmEngine, Instance, Linker, Module, Store, TypedFunc};

const MAX_WASM_MODULE_BYTES: usize = 1_048_576;
const MAX_SCRIPT_INPUT_BYTES: usize = 65_536;
const MAX_SCRIPT_OUTPUT_BYTES: usize = 262_144;
const MAX_SCRIPT_FUEL: u64 = 2_000_000;

#[derive(Debug, Clone, Default)]
struct SandboxState {
    _reserved: (),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Pipeline {
    pub id: String,
    pub name: String,
    pub steps: Vec<Step>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Step {
    pub id: String,
    pub kind: String, // "script", "http", "slack", etc.
    pub code: Option<String>,
}

#[derive(Debug)]
pub enum ExecutionError {
    ScriptError(String),
    SandboxError(String),
    UnknownKind(String),
}

pub struct CoreVm {
    wasm_engine: WasmEngine,
}

impl CoreVm {
    pub fn new() -> Self {
        let mut config = WasmConfig::default();
        config.consume_fuel(true);

        let wasm_engine = WasmEngine::new(&config).unwrap_or_else(|_| WasmEngine::default());

        Self {
            wasm_engine,
        }
    }

    pub fn execute_wat_script(&self, code: &str, input: &Value) -> Result<Value, ExecutionError> {
        let wasm_bytes: Vec<u8> = wat::parse_str(code)
            .map_err(|e: wat::Error| ExecutionError::SandboxError(e.to_string()))?;
        if wasm_bytes.len() > MAX_WASM_MODULE_BYTES {
            return Err(ExecutionError::SandboxError(
                "WASM module is larger than allowed limit".to_string(),
            ));
        }

        let module = Module::new(&self.wasm_engine, wasm_bytes)
            .map_err(|e: wasmtime::Error| ExecutionError::SandboxError(e.to_string()))?;

        let mut store = Store::new(&self.wasm_engine, SandboxState::default());
        store
            .set_fuel(MAX_SCRIPT_FUEL)
            .map_err(|e| ExecutionError::SandboxError(e.to_string()))?;
        let linker = Linker::new(&self.wasm_engine);
        let instance: Instance = linker
            .instantiate(&mut store, &module)
            .map_err(|e: wasmtime::Error| ExecutionError::SandboxError(e.to_string()))?;

        let memory = instance.get_memory(&mut store, "memory").ok_or_else(|| {
            ExecutionError::SandboxError("sandbox module must export memory".to_string())
        })?;

        let alloc: TypedFunc<i32, i32> = instance
            .get_typed_func(&mut store, "alloc")
            .map_err(|e: wasmtime::Error| ExecutionError::SandboxError(e.to_string()))?;
        let run: TypedFunc<(i32, i32), i64> = instance
            .get_typed_func(&mut store, "run")
            .map_err(|e: wasmtime::Error| ExecutionError::SandboxError(e.to_string()))?;

        let input_bytes =
            serde_json::to_vec(input).map_err(|e| ExecutionError::SandboxError(e.to_string()))?;
        if input_bytes.len() > MAX_SCRIPT_INPUT_BYTES {
            return Err(ExecutionError::SandboxError(
                "sandbox input exceeds max size".to_string(),
            ));
        }

        let input_len = i32::try_from(input_bytes.len())
            .map_err(|_| ExecutionError::SandboxError("input payload too large".to_string()))?;

        let input_ptr = alloc
            .call(&mut store, input_len)
            .map_err(|e: wasmtime::Error| ExecutionError::SandboxError(e.to_string()))?;
        memory
            .write(&mut store, input_ptr as usize, &input_bytes)
            .map_err(|e: wasmtime::MemoryAccessError| {
                ExecutionError::SandboxError(e.to_string())
            })?;

        let packed_output = run
            .call(&mut store, (input_ptr, input_len))
            .map_err(|e: wasmtime::Error| ExecutionError::SandboxError(e.to_string()))?;
        let output_ptr = (packed_output >> 32) as u32 as usize;
        let output_len = (packed_output & 0xffff_ffff) as u32 as usize;

        if output_len > MAX_SCRIPT_OUTPUT_BYTES {
            return Err(ExecutionError::SandboxError(
                "sandbox output exceeds max size".to_string(),
            ));
        }

        if output_len == 0 {
            return Ok(Value::Null);
        }

        let mut output_bytes = vec![0u8; output_len];
        memory
            .read(&mut store, output_ptr, &mut output_bytes)
            .map_err(|e: wasmtime::MemoryAccessError| {
                ExecutionError::SandboxError(e.to_string())
            })?;

        let output_text = String::from_utf8(output_bytes)
            .map_err(|e| ExecutionError::SandboxError(e.to_string()))?;

        match serde_json::from_str::<Value>(&output_text) {
            Ok(value) => Ok(value),
            Err(_) => Ok(Value::String(output_text)),
        }
    }

    pub fn execute_pipeline(
        &self,
        pipeline: &Pipeline,
        initial_context: Map,
    ) -> Result<Map, ExecutionError> {
        let mut scope = Scope::new();
        // Insert initial context as "ctx" into Rhai scope
        let ctx_dyn: Dynamic = initial_context.clone().into();
        scope.push("ctx", ctx_dyn);

        for step in &pipeline.steps {
            match step.kind.as_str() {
                "script" => {
                    if let Some(ref code) = step.code {
                        let input = serde_json::json!({
                            "pipeline_id": pipeline.id,
                            "pipeline_name": pipeline.name,
                            "step_count": pipeline.steps.len(),
                        });
                        let _ = self.execute_wat_script(code, &input)?;
                    }
                }
                "http" | "slack" => {
                    // For now, these plugins are executed directly in core-connectors,
                    // but we might stub them out here.
                    println!("Executing special step: {} (id: {})", step.kind, step.id);
                }
                _ => return Err(ExecutionError::UnknownKind(step.kind.clone())),
            }
        }

        // Return accumulated context by extracting "ctx" from scope
        if let Some(final_ctx) = scope.get_value::<Map>("ctx") {
            Ok(final_ctx)
        } else {
            Ok(initial_context) // fallback
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wat_sandbox_round_trips_json_output() {
        let vm = CoreVm::new();
        let output = vm
            .execute_wat_script(
                r#"
            (module
              (memory (export "memory") 1)
              (global $heap (mut i32) (i32.const 1024))
              (func (export "alloc") (param $size i32) (result i32)
                (local $ptr i32)
                global.get $heap
                local.set $ptr
                local.get $ptr
                local.get $size
                i32.add
                global.set $heap
                local.get $ptr)
                            (data (i32.const 4096) "42")
              (func (export "run") (param $input_ptr i32) (param $input_len i32) (result i64)
                                i64.const 4096
                i64.const 32
                i64.shl
                i64.const 2
                i64.or))
            "#,
                &serde_json::json!({"hello": "sandbox"}),
            )
            .expect("sandbox execution");

        assert_eq!(output, serde_json::json!(42));
    }

        #[test]
        fn wat_sandbox_blocks_oversized_output_len() {
                let vm = CoreVm::new();

                let result = vm.execute_wat_script(
                        r#"
                        (module
                            (memory (export "memory") 1)
                            (func (export "alloc") (param $size i32) (result i32)
                                i32.const 0)
                            (func (export "run") (param $input_ptr i32) (param $input_len i32) (result i64)
                                i64.const 262145))
                        "#,
                        &serde_json::json!({"hello": "sandbox"}),
                );

                assert!(matches!(
                        result,
                        Err(ExecutionError::SandboxError(msg)) if msg.contains("sandbox output exceeds max size")
                ));
        }

        #[test]
        fn wat_sandbox_interrupts_runaway_loop_by_fuel() {
                let vm = CoreVm::new();

                let result = vm.execute_wat_script(
                        r#"
                        (module
                            (memory (export "memory") 1)
                            (func (export "alloc") (param $size i32) (result i32)
                                i32.const 0)
                            (func (export "run") (param $input_ptr i32) (param $input_len i32) (result i64)
                                (loop
                                    br 0)
                                i64.const 0))
                        "#,
                        &serde_json::json!({"hello": "sandbox"}),
                );

                assert!(matches!(result, Err(ExecutionError::SandboxError(_))));
        }
}
