/* eslint-disable @typescript-eslint/no-require-imports -- Node 20 CommonJS test harness loads TypeScript through the local compiler hook. */
// Use the installed TypeScript compiler with Node's built-in test runner.
const ts = require('typescript');
const fs = require('node:fs');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
