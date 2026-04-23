use rhai::{Engine, Dynamic, Map, Scope};
use serde::{Deserialize, Serialize};

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
    UnknownKind(String),
}

pub struct CoreVm {
    engine: Engine,
}

impl CoreVm {
    pub fn new() -> Self {
        Self {
            engine: Engine::new(),
        }
    }

    pub fn execute_pipeline(&self, pipeline: &Pipeline, initial_context: Map) -> Result<Map, ExecutionError> {
        let mut scope = Scope::new();
        // Insert initial context as "ctx" into Rhai scope
        let ctx_dyn: Dynamic = initial_context.clone().into();
        scope.push("ctx", ctx_dyn);

        for step in &pipeline.steps {
            match step.kind.as_str() {
                "script" => {
                    if let Some(ref code) = step.code {
                        let ast = self.engine.compile(code).map_err(|e| ExecutionError::ScriptError(e.to_string()))?;
                        
                        // We run the script. It can mutate `ctx`
                        self.engine.run_ast_with_scope(&mut scope, &ast)
                            .map_err(|e| ExecutionError::ScriptError(e.to_string()))?;
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
