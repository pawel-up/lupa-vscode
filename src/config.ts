import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

/**
 * Resolved Lupa configuration for a workspace.
 */
export interface LupaConfig {
  /** Absolute path to the lupa binary */
  binPath: string
  /** Absolute path to the lupa config file */
  configPath: string
  /** Workspace root directory */
  workspaceRoot: string
}

/**
 * Try to resolve the lupa configuration for the given workspace folder.
 * Returns undefined if lupa is not installed or no config file can be found.
 */
export function resolveLupaConfig(workspaceFolder: vscode.WorkspaceFolder): LupaConfig | undefined {
  const root = workspaceFolder.uri.fsPath

  const binPath = resolvebin(root)
  if (!binPath) {
    return undefined
  }

  const configPath = resolveConfigPath(root)
  if (!configPath) {
    return undefined
  }

  return { binPath, configPath, workspaceRoot: root }
}

function resolvebin(root: string): string | undefined {
  const override = vscode.workspace.getConfiguration('lupa').get<string>('binPath')
  if (override) {
    return override
  }

  const candidate = path.join(root, 'node_modules', '.bin', 'lupa')
  return fs.existsSync(candidate) ? candidate : undefined
}

function resolveConfigPath(root: string): string | undefined {
  for (const name of ['lupa.config.ts', 'lupa.config.js']) {
    const candidate = path.join(root, name)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  // Fallback: scan the "test" script in package.json for -c/--config <path>
  const pkgPath = path.join(root, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> }
      const testScript = pkg.scripts?.test ?? ''
      const match = testScript.match(/(?:-c|--config)\s+(\S+)/)
      if (match) {
        const candidate = path.resolve(root, match[1])
        if (fs.existsSync(candidate)) {
          return candidate
        }
      }
    } catch {
      // Malformed package.json — ignore
    }
  }

  return undefined
}
