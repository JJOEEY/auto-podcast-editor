import { spawn } from 'node:child_process';
import { LOCAL_LLM_LIMITS, parseLocalLlmCommands, EDIT_COMMAND_JSON_SCHEMA } from '../core/localLlm.ts';
import type { EditorCommand } from '../core/types.js';

export interface LocalLlmRunOptions {
  binary: string;
  modelPath: string;
  prompt: string;
  deadlineMs: number;
  gpuLayers: number;
  onKill?: (kill: () => void) => void;
}

export function runLocalLlm(options: LocalLlmRunOptions): Promise<EditorCommand[]> {
  return new Promise((resolve, reject) => {
    const remaining = Math.max(1, options.deadlineMs - Date.now());
    const child = spawn(options.binary, [
      '-m', options.modelPath,
      '-c', String(LOCAL_LLM_LIMITS.contextTokens),
      '-n', String(LOCAL_LLM_LIMITS.outputTokens),
      '--temp', '0',
      '--top-p', '0.9',
      '--no-display-prompt',
      '--no-context-shift',
      '--no-jinja',
      '--single-turn',
      '--json-schema', EDIT_COMMAND_JSON_SCHEMA,
      '-ngl', String(Math.max(0, options.gpuLayers)),
      '-p', options.prompt,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    options.onKill?.(() => child.kill());
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn: () => void): void => { if (!settled) { settled = true; clearTimeout(timer); fn(); } };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error('local LLM timeout or cancelled')));
    }, remaining);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => finish(() => reject(error)));
    child.on('close', (code) => finish(() => {
      if (Date.now() > options.deadlineMs) { reject(new Error('local LLM timeout')); return; }
      if (code !== 0) { reject(new Error(`local LLM exited with code ${code ?? -1}: ${stderr.slice(-800)}`)); return; }
      resolve(parseLocalLlmCommands(stdout));
    }));
  });
}
