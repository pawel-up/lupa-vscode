import * as vscode from 'vscode'
import { resolveLupaConfig } from './config'
import { LupaController } from './controller'
import { log, disposeChannel } from './logger'

const controllers: LupaController[] = []

export function activate(context: vscode.ExtensionContext): void {
  log('Extension activating')
  const folders = vscode.workspace.workspaceFolders ?? []

  for (const folder of folders) {
    tryRegister(folder, context)
  }

  // Handle workspaces opened after activation
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      for (const folder of event.added) {
        tryRegister(folder, context)
      }
    })
  )
}

export function deactivate(): void {
  for (const c of controllers) {
    c.dispose()
  }
  controllers.length = 0
  disposeChannel()
}

function tryRegister(folder: vscode.WorkspaceFolder, context: vscode.ExtensionContext): void {
  const config = resolveLupaConfig(folder)
  if (!config) {
    log(`Lupa not found in "${folder.uri.fsPath}" — skipping`)
    return
  }

  log(`Registering controller for "${folder.uri.fsPath}" (config: ${config.configPath})`)
  const controller = new LupaController(folder, config)
  controllers.push(controller)
  context.subscriptions.push(controller)
}
