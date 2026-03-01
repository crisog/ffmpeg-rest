import { readFileSync } from 'node:fs';
import { dirname, join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const getPackageVersion = (): string => {
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = join(dir, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
    return packageJson.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

/**
 * Derives an output path from an input path by swapping the extension.
 * Output is placed in the same directory as the input.
 */
export const deriveOutputPath = (inputPath: string, outputExtension: string): string => {
  const dir = dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  return join(dir, `${base}.${outputExtension}`);
};
