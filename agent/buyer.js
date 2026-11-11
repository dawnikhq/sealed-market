#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tsxBin = path.resolve(__dirname, 'node_modules', '.bin', 'tsx');
const scriptPath = path.resolve(__dirname, 'src', 'buyer.ts');

const child = spawn(tsxBin, [scriptPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
