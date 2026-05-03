use rhai::{Array, Dynamic, Map, Scope};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use wasmtime::{
    Config as WasmConfig, Engine as WasmEngine, Instance, Linker, Module, Store, TypedFunc,
};

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

        Self { wasm_engine }
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

    pub fn execute_wasm_module(&self, wasm_bytes: &[u8], input: &Value, timeout_ms: u64) -> Result<Value, ExecutionError> {
        if wasm_bytes.len() > MAX_WASM_MODULE_BYTES {
            return Err(ExecutionError::SandboxError(
                "WASM module is larger than allowed limit".to_string(),
            ));
        }

        let module = Module::new(&self.wasm_engine, wasm_bytes)
            .map_err(|e: wasmtime::Error| ExecutionError::SandboxError(e.to_string()))?;

        // We'll create the store and get an interrupt handle so we can cancel long runs.
        let mut _store = Store::new(&self.wasm_engine, SandboxState::default());
        let _ = _store.set_fuel(MAX_SCRIPT_FUEL);

        // We'll run the module on a dedicated thread and wait for a limited time.
        let engine = self.wasm_engine.clone();
        let input_bytes = serde_json::to_vec(input).map_err(|e| ExecutionError::SandboxError(e.to_string()))?;
        if input_bytes.len() > MAX_SCRIPT_INPUT_BYTES {
            return Err(ExecutionError::SandboxError("sandbox input exceeds max size".to_string()));
        }

        let (tx, rx) = std::sync::mpsc::channel();

        let module_clone = module.clone();

        std::thread::spawn(move || {
            // Instantiate and execute inside thread-local store
            let mut thread_store = Store::new(&engine, SandboxState::default());
            let _ = thread_store.set_fuel(MAX_SCRIPT_FUEL);
            let linker = Linker::new(&engine);
            let inst = match linker.instantiate(&mut thread_store, &module_clone) {
                Ok(i) => i,
                Err(e) => {
                    let _ = tx.send(Err(ExecutionError::SandboxError(e.to_string())));
                    return;
                }
            };

            let memory = match inst.get_memory(&mut thread_store, "memory") {
                Some(m) => m,
                None => {
                    let _ = tx.send(Err(ExecutionError::SandboxError("sandbox module must export memory".to_string())));
                    return;
                }
            };

            let alloc: TypedFunc<i32, i32> = match inst.get_typed_func(&mut thread_store, "alloc") {
                Ok(f) => f,
                Err(e) => {
                    let _ = tx.send(Err(ExecutionError::SandboxError(e.to_string())));
                    return;
                }
            };

            let run: TypedFunc<(i32, i32), i64> = match inst.get_typed_func(&mut thread_store, "run") {
                Ok(f) => f,
                Err(e) => {
                    let _ = tx.send(Err(ExecutionError::SandboxError(e.to_string())));
                    return;
                }
            };

            let input_len = match i32::try_from(input_bytes.len()) {
                Ok(l) => l,
                Err(_) => {
                    let _ = tx.send(Err(ExecutionError::SandboxError("input payload too large".to_string())));
                    return;
                }
            };

            let input_ptr = match alloc.call(&mut thread_store, input_len) {
                Ok(p) => p,
                Err(e) => {
                    let _ = tx.send(Err(ExecutionError::SandboxError(e.to_string())));
                    return;
                }
            };

            if let Err(e) = memory.write(&mut thread_store, input_ptr as usize, &input_bytes) {
                let _ = tx.send(Err(ExecutionError::SandboxError(e.to_string())));
                return;
            }

            let packed_output = match run.call(&mut thread_store, (input_ptr, input_len)) {
                Ok(v) => v,
                Err(e) => {
                    let _ = tx.send(Err(ExecutionError::SandboxError(e.to_string())));
                    return;
                }
            };

            let output_ptr = (packed_output >> 32) as u32 as usize;
            let output_len = (packed_output & 0xffff_ffff) as u32 as usize;

            if output_len > MAX_SCRIPT_OUTPUT_BYTES {
                let _ = tx.send(Err(ExecutionError::SandboxError("sandbox output exceeds max size".to_string())));
                return;
            }

            if output_len == 0 {
                let _ = tx.send(Ok(Value::Null));
                return;
            }

            let mut output_bytes = vec![0u8; output_len];
            if let Err(e) = memory.read(&mut thread_store, output_ptr, &mut output_bytes) {
                let _ = tx.send(Err(ExecutionError::SandboxError(e.to_string())));
                return;
            }

            let output_text = match String::from_utf8(output_bytes) {
                Ok(s) => s,
                Err(e) => {
                    let _ = tx.send(Err(ExecutionError::SandboxError(e.to_string())));
                    return;
                }
            };

            match serde_json::from_str::<Value>(&output_text) {
                Ok(value) => {
                    let _ = tx.send(Ok(value));
                }
                Err(_) => {
                    let _ = tx.send(Ok(Value::String(output_text)));
                }
            }
        });

        // Wait for result with timeout. Note: we rely on fuel exhaustion to bound runaway CPU usage.
        match rx.recv_timeout(std::time::Duration::from_millis(timeout_ms)) {
            Ok(res) => res,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                Err(ExecutionError::SandboxError("execution timed out".to_string()))
            }
            Err(e) => Err(ExecutionError::SandboxError(e.to_string())),
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
                    // These steps are executed in core-connectors. The VM records
                    // observability metadata for diagnostics and replay traces.
                    if let Some(mut ctx) = scope.get_value::<Map>("ctx") {
                        let observed_at_ms = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|duration| duration.as_millis())
                            .unwrap_or(0);

                        let mut trace_steps = ctx
                            .get("trace_steps")
                            .and_then(|value| value.clone().try_cast::<Array>())
                            .unwrap_or_default();

                        trace_steps.push(Dynamic::from(serde_json::json!({
                            "step_id": step.id,
                            "kind": step.kind,
                            "observed_at_ms": observed_at_ms,
                        }).to_string()));

                        ctx.insert("trace_steps".into(), Dynamic::from_array(trace_steps));
                        scope.set_value("ctx", Dynamic::from(ctx));
                    }

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

        #[test]
        fn wasm_module_round_trips_json_input() {
                let vm = CoreVm::new();

                let wasm = wat::parse_str(
                        r#"
                        (module
                            (memory (export "memory") 1)
                            (global $heap (mut i32) (i32.const 1024))
                            (data (i32.const 2048) "{\"ok\":true}")

                            (func (export "alloc") (param $size i32) (result i32)
                                (local $ptr i32)
                                global.get $heap
                                local.set $ptr
                                local.get $ptr
                                local.get $size
                                i32.add
                                global.set $heap
                                local.get $ptr)

                            (func (export "run") (param $input_ptr i32) (param $input_len i32) (result i64)
                                i64.const 2048
                                i64.const 32
                                i64.shl
                                i64.const 12
                                i64.or))
                        "#,
                )
                .expect("valid wat");

                let result = vm
                        .execute_wasm_module(&wasm, &serde_json::json!({"hello": "world"}), 100)
                        .expect("execute wasm module");

                assert_eq!(result, serde_json::json!({"ok": true}));
        }

        #[test]
        fn wasm_module_times_out_on_runaway_loop() {
                let vm = CoreVm::new();

                let wasm = wat::parse_str(
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
                )
                .expect("valid wat");

                let result = vm.execute_wasm_module(&wasm, &serde_json::json!({"hello": "world"}), 1);

                assert!(matches!(result, Err(ExecutionError::SandboxError(msg)) if msg.contains("timed out")));
        }
}
