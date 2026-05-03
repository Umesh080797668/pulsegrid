import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  buildJavyWrapper,
  prepareCodeForCompilation,
  validateJavaScriptSource,
  validatePythonSource,
} from '../../../../lib/code-step-compiler';

export const runtime = 'nodejs';

type CompileRequest = {
  language?: 'javascript' | 'python';
  sourceCode?: string;
  stepId?: string;
};

async function runCommand(command: string, args: string[], input?: string, timeoutMs = 30_000) {
  return await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Javy compilation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, code });
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as CompileRequest;
  const language = body.language || 'javascript';
  const sourceCode = (body.sourceCode || '').trim();

  if (!sourceCode) {
    return Response.json({ error: 'sourceCode is required' }, { status: 400 });
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulsegrid-code-step-'));
  const inputFile = path.join(tempDir, `${randomUUID()}.js`);
  const outputFile = path.join(tempDir, `${randomUUID()}.wasm`);

  try {
    const validationIssues = language === 'python' ? validatePythonSource(sourceCode) : validateJavaScriptSource(sourceCode);
    const validationError = validationIssues.find((issue: { severity: 'error' | 'warning' }) => issue.severity === 'error');
    if (validationError) {
      return Response.json(
        {
          error: validationError.message,
          issues: validationIssues,
          code: 'SOURCE_VALIDATION_FAILED',
        },
        { status: 400 },
      );
    }

    const prepared = prepareCodeForCompilation(language, sourceCode);
    const wrappedCode = buildJavyWrapper(prepared.javascriptSource);
    const wrappedCodeBytes = Buffer.byteLength(wrappedCode, 'utf8');
    const MAX_SOURCE_SIZE = 10 * 1024 * 1024; // 10MB
    if (wrappedCodeBytes > MAX_SOURCE_SIZE) {
      return Response.json(
        {
          error: `Source code exceeds maximum size of 10MB (current: ${(wrappedCodeBytes / 1024 / 1024).toFixed(2)}MB)`,
          code: 'CODE_TOO_LARGE',
        },
        { status: 413 },
      );
    }

    await fs.writeFile(inputFile, wrappedCode, 'utf8');
    const binaryPath = path.join(process.cwd(), 'node_modules', '.bin', 'javy');
    const result = await runCommand(binaryPath, ['compile', '-o', outputFile, inputFile]);

    if (result.code !== 0) {
      return Response.json(
        {
          error: result.stderr || 'Javy compilation failed',
          stdout: result.stdout,
        },
        { status: 500 },
      );
    }
    // Validate output WASM size (max 50MB)
    const wasmBytes = await fs.readFile(outputFile);
    const MAX_WASM_SIZE = 50 * 1024 * 1024; // 50MB
    if (wasmBytes.length > MAX_WASM_SIZE) {
      return Response.json(
        {
          error: `Compiled WASM exceeds maximum size of 50MB (current: ${(wasmBytes.length / 1024 / 1024).toFixed(2)}MB)`,
          code: 'WASM_TOO_LARGE',
        },
        { status: 413 },
      );
    }
    return Response.json({
      success: true,
      wasmBase64: Buffer.from(wasmBytes).toString('base64'),
      wasmSizeBytes: wasmBytes.length,
      sourceCodeSizeBytes: Buffer.byteLength(sourceCode, 'utf8'),
      wrappedCodeSizeBytes: wrappedCodeBytes,
      warnings: prepared.warnings,
      stdout: result.stdout,
      stderr: result.stderr,
      language,
      stepId: body.stepId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
