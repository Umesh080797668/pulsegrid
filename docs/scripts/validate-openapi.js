const fs = require('fs');
const path = require('path');
const SwaggerParser = require('swagger-parser');

async function run() {
  const file = path.join(__dirname, '..', 'data', 'openapi.json');
  if (!fs.existsSync(file)) {
    console.error('OpenAPI snapshot not found:', file);
    process.exit(2);
  }

  try {
    const api = await SwaggerParser.dereference(file);
    // Basic checks: ensure paths exist and /connectors/catalog has an example
    if (!api.paths || Object.keys(api.paths).length === 0) {
      console.error('No paths defined in OpenAPI snapshot');
      process.exit(2);
    }

    const missingExamples = [];
    for (const [p, methods] of Object.entries(api.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const responses = op.responses || {};
        const ok = responses['200'] || responses['201'] || responses['default'];
        if (!ok) {
          missingExamples.push(`${method.toUpperCase()} ${p} — no 200/201/default response`);
          continue;
        }
        const content = ok.content || {};
        const hasExample = Object.values(content).some((c) => c.example || (c.examples && Object.keys(c.examples).length > 0));
        if (!hasExample) {
          missingExamples.push(`${method.toUpperCase()} ${p} — response has no example`);
        }
      }
    }

    if (missingExamples.length > 0) {
      console.error('OpenAPI snapshot missing examples or responses:');
      missingExamples.slice(0, 20).forEach((m) => console.error('  -', m));
      process.exit(2);
    }

    console.log('OpenAPI snapshot validation passed.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to validate OpenAPI snapshot:', err.message || err);
    process.exit(2);
  }
}

run();
