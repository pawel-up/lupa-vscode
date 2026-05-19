import * as vscode from 'vscode'
import type { LupaConfig } from './config'
import { discoverTests } from './discovery'
import { runTests } from './runner'
import { createWatchers } from './watcher'

/**
 * Owns the vscode.TestController and its lifecycle for one workspace folder.
 * Dispose to tear everything down.
 */
export class LupaController implements vscode.Disposable {
  private readonly controller: vscode.TestController
  private readonly disposables: vscode.Disposable[] = []
  private discoveryPending = false

  constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly config: LupaConfig
  ) {
    this.controller = vscode.tests.createTestController(
      `lupa-${workspaceFolder.uri.fsPath}`,
      'Lupa'
    )

    this.controller.refreshHandler = () => this.scheduleDiscovery()

    this.controller.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      (request, token) => runTests(request, this.controller, config, token),
      true
    )

    const watcherDisposable = createWatchers(workspaceFolder, () => this.scheduleDiscovery())
    this.disposables.push(this.controller, watcherDisposable)

    // Initial discovery
    this.scheduleDiscovery()
  }

  /**
   * Debounce rapid successive file-system events into a single discovery run.
   */
  private scheduleDiscovery(): void {
    if (this.discoveryPending) return
    this.discoveryPending = true

    setTimeout(() => {
      this.discoveryPending = false
      discoverTests(this.controller, this.config).catch(() => {
        // Discovery errors are silent — the tree stays empty
      })
    }, 300)
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose()
    }
  }
}
