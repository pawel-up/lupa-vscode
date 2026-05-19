import * as vscode from 'vscode'

/**
 * Create file system watchers that trigger re-discovery when relevant files change.
 * Returns a Disposable that cleans up all watchers.
 */
export function createWatchers(
  workspaceFolder: vscode.WorkspaceFolder,
  onChanged: () => void
): vscode.Disposable {
  const disposables: vscode.Disposable[] = []

  const trigger = () => onChanged()

  // Watch for test file additions/deletions (content changes don't affect the tree)
  for (const pattern of ['**/*.spec.ts', '**/*.spec.js', '**/*.test.ts', '**/*.test.js']) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolder, pattern)
    )
    watcher.onDidCreate(trigger, undefined, disposables)
    watcher.onDidDelete(trigger, undefined, disposables)
    disposables.push(watcher)
  }

  // Watch the lupa config files — config changes may affect which tests are discovered
  for (const name of ['lupa.config.ts', 'lupa.config.js', 'package.json']) {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolder, name)
    )
    watcher.onDidCreate(trigger, undefined, disposables)
    watcher.onDidChange(trigger, undefined, disposables)
    watcher.onDidDelete(trigger, undefined, disposables)
    disposables.push(watcher)
  }

  return vscode.Disposable.from(...disposables)
}
