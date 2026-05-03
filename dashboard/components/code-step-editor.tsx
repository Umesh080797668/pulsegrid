'use client';
import { useEffect, useMemo, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import {
  validateJavaScriptSource,
  validatePythonSource,
  type CodeStepLintIssue,
} from '../lib/code-step-compiler';

export type CodeStepLanguage = 'javascript' | 'python';

export function CodeStepEditor({
  language,
  sourceCode,
  compiledWasmBase64,
  compileStatus,
  compileError,
  onLanguageChange,
  onSourceCodeChange,
  onCompiledWasmChange,
  onCompile,
  isCompiling,
}: {
  language: CodeStepLanguage;
  sourceCode: string;
  compiledWasmBase64: string;
  compileStatus: string;
  compileError: string;
  onLanguageChange: (value: CodeStepLanguage) => void;
  onSourceCodeChange: (value: string) => void;
  onCompiledWasmChange: (value: string) => void;
  onCompile: () => void | Promise<void>;
  isCompiling: boolean;
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);

  const lintIssues = useMemo<CodeStepLintIssue[]>(
    () => (language === 'python' ? validatePythonSource(sourceCode) : validateJavaScriptSource(sourceCode)),
    [language, sourceCode],
  );

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor) return;
    if (!monaco) return;

    const model = editor.getModel();
    if (!model) return;

    const markers = lintIssues.map((issue) => ({
      severity: issue.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: issue.message,
      startLineNumber: issue.line,
      startColumn: issue.column,
      endLineNumber: issue.endLine ?? issue.line,
      endColumn: issue.endColumn ?? Math.max(issue.column + 1, issue.column),
    }));

    monaco.editor.setModelMarkers(model, 'code-step', markers);

    return () => {
      if (editor.getModel()) {
        monaco.editor.setModelMarkers(editor.getModel()!, 'code-step', []);
      }
    };
  }, [language, lintIssues, sourceCode]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    const model = editor.getModel();
    if (!model) return;

    const markers = lintIssues.map((issue) => ({
      severity: issue.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      message: issue.message,
      startLineNumber: issue.line,
      startColumn: issue.column,
      endLineNumber: issue.endLine ?? issue.line,
      endColumn: issue.endColumn ?? Math.max(issue.column + 1, issue.column),
    }));

    monaco.editor.setModelMarkers(model, 'code-step', markers);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aab2d5' }}>
          Source language
        </label>
        <select
          value={language}
          onChange={(event) => onLanguageChange(event.target.value as CodeStepLanguage)}
          style={{ padding: '8px 10px', borderRadius: 8, minWidth: 160 }}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
        </select>
        <button
          onClick={onCompile}
          disabled={isCompiling}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: 'none',
            background: '#7c9cff',
            color: '#081018',
            fontWeight: 700,
            cursor: isCompiling ? 'progress' : 'pointer',
          }}
        >
          {isCompiling ? 'Compiling…' : 'Compile to WASM'}
        </button>
      </div>

      <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
        Define a <strong>transform(input)</strong> function. The compiler passes the previous step output as JSON, and the WASM module must return JSON-serializable output.
      </div>

      <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
        <Editor
          height="320px"
          defaultLanguage={language === 'javascript' ? 'javascript' : 'python'}
          language={language === 'javascript' ? 'javascript' : 'python'}
          theme="vs-dark"
          value={sourceCode}
          onChange={(value) => onSourceCodeChange(value || '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
          }}
        />
      </div>

      {lintIssues.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lintIssues.map((issue, index) => (
            <div
              key={`${issue.line}:${issue.column}:${index}`}
              className={`badge ${issue.severity === 'error' ? 'b-danger' : 'b-neutral'}`}
              style={{ justifyContent: 'flex-start', whiteSpace: 'normal', lineHeight: 1.5 }}
            >
              Line {issue.line}: {issue.message}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#aab2d5' }}>
          Compiled WASM artifact (base64)
        </label>
        <textarea
          rows={7}
          value={compiledWasmBase64}
          onChange={(event) => onCompiledWasmChange(event.target.value)}
          placeholder="Compiled base64-encoded WASM module"
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.03)',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 12,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="badge b-neutral">{compileStatus || 'Not compiled'}</div>
        {compileError ? <div className="badge b-danger">{compileError}</div> : null}
      </div>
    </div>
  );
}
