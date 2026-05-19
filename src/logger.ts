import * as vscode from 'vscode'

let channel: vscode.OutputChannel | undefined

export function getChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Lupa', { log: true })
  }
  return channel
}

/** Always-visible messages: errors, warnings, lifecycle events. */
export function log(message: string): void {
  getChannel().appendLine(`[lupa] ${message}`)
}

/** Only shown when lupa.verbose is true — use for per-event NDJSON noise. */
export function logVerbose(message: string): void {
  if (vscode.workspace.getConfiguration('lupa').get<boolean>('verbose')) {
    getChannel().appendLine(`[lupa:verbose] ${message}`)
  }
}

export function disposeChannel(): void {
  channel?.dispose()
  channel = undefined
}
