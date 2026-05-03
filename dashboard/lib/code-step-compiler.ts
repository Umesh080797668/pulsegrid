export type CodeStepLanguage = 'javascript' | 'python';

export type CodeStepLintIssue = {
  severity: 'error' | 'warning';
  message: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
};

export type PreparedCodeStepSource = {
  language: CodeStepLanguage;
  javascriptSource: string;
  warnings: string[];
};

export function buildJavyWrapper(sourceCode: string) {
  const escapedSource = JSON.stringify(sourceCode);
  return `
function __pulsegridReadAllStdin() {
  const chunks = [];
  let total = 0;
  while (true) {
    const buffer = new Uint8Array(4096);
    const bytesRead = Javy.IO.readSync(0, buffer);
    if (bytesRead <= 0) {
      break;
    }
    const chunk = buffer.slice(0, bytesRead);
    chunks.push(chunk);
    total += chunk.length;
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  if (total === 0) {
    return null;
  }

  const text = new TextDecoder().decode(merged);
  return JSON.parse(text);
}

function __pulsegridWriteAllStdout(text) {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  while (offset < bytes.length) {
    const written = Javy.IO.writeSync(1, bytes.subarray(offset));
    if (written <= 0) {
      throw new Error('failed to write output');
    }
    offset += written;
  }
}

const __pulsegridUserSource = ${escapedSource};
if (!__pulsegridUserSource || typeof __pulsegridUserSource !== 'string') {
  throw new Error('Code step source must be a string');
}

eval(__pulsegridUserSource);

async function __pulsegridEntry() {
  const input = __pulsegridReadAllStdin();
  if (typeof transform !== 'function') {
    throw new Error('Code step source must define a transform(input) function');
  }

  const result = await transform(input);
  const output = typeof result === 'string' ? result : JSON.stringify(result ?? null);
  __pulsegridWriteAllStdout(output);
}

__pulsegridEntry().catch((error) => {
  __pulsegridWriteAllStdout(JSON.stringify({ error: String(error?.message || error) }));
  throw error;
});
`;
}

function convertPythonExpressionToJs(expression: string) {
  return expression
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
    .replace(/\band\b/g, '&&')
    .replace(/\bor\b/g, '||')
    .replace(/\bnot\b/g, '!')
    .replace(/\blen\((.+?)\)/g, '($1).length')
    .replace(/\bstr\((.+?)\)/g, 'String($1)')
    .replace(/\bint\((.+?)\)/g, 'parseInt($1, 10)')
    .replace(/\bfloat\((.+?)\)/g, 'parseFloat($1)')
    .replace(/([A-Za-z_][\w]*)\.get\((['"])([^'"]+)\2\)/g, '$1[$2$3$2]')
    .replace(/([A-Za-z_][\w]*)\.append\(/g, '$1.push(');
}

function indentWidth(text: string) {
  return text.replace(/\t/g, '    ').length;
}

function reportUnsupported(lines: string[], lineNumber: number, message: string) {
  const sourceLine = lines[lineNumber - 1]?.trim() || '';
  throw new Error(`Python compilation failed on line ${lineNumber}: ${message}${sourceLine ? ` (${sourceLine})` : ''}`);
}

export function validateJavaScriptSource(sourceCode: string): CodeStepLintIssue[] {
  const issues: CodeStepLintIssue[] = [];
  const trimmed = sourceCode.trim();

  if (!trimmed) {
    issues.push({ severity: 'error', message: 'Source code cannot be empty', line: 1, column: 1 });
    return issues;
  }

  try {
    // The wrapper expects a top-level transform(input) function declaration or assignment.
    // Using new Function here catches syntax errors without executing the code.
    // eslint-disable-next-line no-new-func
    new Function(sourceCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push({ severity: 'error', message, line: 1, column: 1 });
  }

  if (!/\btransform\s*\(/.test(sourceCode)) {
    issues.push({ severity: 'warning', message: 'Define a transform(input) function for runtime execution', line: 1, column: 1 });
  }

  return issues;
}

export function validatePythonSource(sourceCode: string): CodeStepLintIssue[] {
  const issues: CodeStepLintIssue[] = [];
  const lines = sourceCode.replace(/\r\n/g, '\n').split('\n');

  if (!sourceCode.trim()) {
    issues.push({ severity: 'error', message: 'Source code cannot be empty', line: 1, column: 1 });
    return issues;
  }

  if (!/^\s*def\s+transform\s*\(\s*input\s*\)\s*:\s*$/m.test(sourceCode)) {
    issues.push({ severity: 'error', message: 'Python code must define def transform(input):', line: 1, column: 1 });
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    if (/^(import|from)\s+/.test(trimmed)) {
      issues.push({ severity: 'error', message: 'Import statements are not supported in code steps', line: index + 1, column: 1 });
    }

    if (/^async\s+def\b/.test(trimmed)) {
      issues.push({ severity: 'error', message: 'Async Python functions are not supported', line: index + 1, column: 1 });
    }

    if (/\b(class|lambda|yield|with|try|except|finally|global|nonlocal)\b/.test(trimmed)) {
      issues.push({ severity: 'error', message: 'This Python construct is not supported by the sandbox compiler', line: index + 1, column: 1 });
    }
  });

  return issues;
}

export function transpilePythonToJavaScript(sourceCode: string): PreparedCodeStepSource {
  const lines = sourceCode.replace(/\r\n/g, '\n').split('\n');
  const warnings: string[] = [];
  const output: string[] = [];
  const indentStack: number[] = [0];
  let sawTransform = false;

  const closeBlocks = (targetIndent: number) => {
    while (indentStack.length > 1 && targetIndent < indentStack[indentStack.length - 1]) {
      indentStack.pop();
      output.push('}');
    }
  };

  lines.forEach((line, index) => {
    const rawIndent = line.match(/^[\t ]*/)?.[0] ?? '';
    const indent = indentWidth(rawIndent);
    const trimmed = line.trim();

    if (!trimmed) {
      if (output.length > 0 && output[output.length - 1] !== '') {
        output.push('');
      }
      return;
    }

    closeBlocks(indent);

    if (trimmed.startsWith('#')) {
      output.push(`// ${trimmed.slice(1).trim()}`);
      return;
    }

    if (/^(import|from)\s+/.test(trimmed)) {
      reportUnsupported(lines, index + 1, 'import statements are not supported');
    }

    if (/^async\s+def\b/.test(trimmed)) {
      reportUnsupported(lines, index + 1, 'async def is not supported');
    }

    if (/\b(class|lambda|yield|with|try|except|finally|global|nonlocal)\b/.test(trimmed)) {
      reportUnsupported(lines, index + 1, 'this Python construct is not supported');
    }

    const functionMatch = trimmed.match(/^def\s+([A-Za-z_][\w]*)\s*\(([^)]*)\)\s*:\s*$/);
    if (functionMatch) {
      output.push(`function ${functionMatch[1]}(${functionMatch[2]}) {`);
      indentStack.push(indent + 4);
      if (functionMatch[1] === 'transform') {
        sawTransform = true;
      }
      return;
    }

    const ifMatch = trimmed.match(/^if\s+(.+):\s*$/);
    if (ifMatch) {
      output.push(`if (${convertPythonExpressionToJs(ifMatch[1])}) {`);
      indentStack.push(indent + 4);
      return;
    }

    const elifMatch = trimmed.match(/^elif\s+(.+):\s*$/);
    if (elifMatch) {
      output.push(`} else if (${convertPythonExpressionToJs(elifMatch[1])}) {`);
      indentStack.push(indent + 4);
      return;
    }

    if (/^else:\s*$/.test(trimmed)) {
      output.push('} else {');
      indentStack.push(indent + 4);
      return;
    }

    const whileMatch = trimmed.match(/^while\s+(.+):\s*$/);
    if (whileMatch) {
      output.push(`while (${convertPythonExpressionToJs(whileMatch[1])}) {`);
      indentStack.push(indent + 4);
      return;
    }

    const forMatch = trimmed.match(/^for\s+([A-Za-z_][\w]*)\s+in\s+(.+):\s*$/);
    if (forMatch) {
      output.push(`for (const ${forMatch[1]} of ${convertPythonExpressionToJs(forMatch[2])}) {`);
      indentStack.push(indent + 4);
      return;
    }

    if (/^return\b/.test(trimmed)) {
      const expression = trimmed.replace(/^return\s*/, '').trim();
      output.push(`return ${expression ? `${convertPythonExpressionToJs(expression)};` : ';'}`);
      return;
    }

    if (/^pass\s*$/.test(trimmed)) {
      output.push('// pass');
      return;
    }

    if (/^break\s*$/.test(trimmed) || /^continue\s*$/.test(trimmed)) {
      output.push(`${trimmed};`);
      return;
    }

    const raiseMatch = trimmed.match(/^raise\s+([A-Za-z_][\w]*)\((.*)\)\s*$/);
    if (raiseMatch) {
      output.push(`throw new Error(${convertPythonExpressionToJs(raiseMatch[2])});`);
      return;
    }

    const printMatch = trimmed.match(/^print\((.*)\)\s*$/);
    if (printMatch) {
      output.push(`console.log(${convertPythonExpressionToJs(printMatch[1])});`);
      return;
    }

    const assignmentMatch = trimmed.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
    if (assignmentMatch) {
      output.push(`let ${assignmentMatch[1]} = ${convertPythonExpressionToJs(assignmentMatch[2])};`);
      return;
    }

    warnings.push(`Line ${index + 1}: preserved as JavaScript comment because the Python compiler did not understand it`);
    output.push(`// unsupported Python syntax: ${trimmed}`);
  });

  closeBlocks(0);

  if (!sawTransform) {
    throw new Error('Python code must define def transform(input):');
  }

  return {
    language: 'python',
    javascriptSource: output.join('\n').trim(),
    warnings,
  };
}

export function prepareCodeForCompilation(language: CodeStepLanguage, sourceCode: string): PreparedCodeStepSource {
  if (language === 'python') {
    return transpilePythonToJavaScript(sourceCode);
  }

  return {
    language,
    javascriptSource: sourceCode,
    warnings: [],
  };
}
