import { vi } from 'vitest'

export class TestMessage {
  constructor(public message: string) {}
}

export const window = {
  createOutputChannel: vi.fn().mockReturnValue({
    appendLine: vi.fn(),
    show: vi.fn(),
    clear: vi.fn(),
    dispose: vi.fn(),
  }),
}

export const workspace = {
  workspaceFolders: [],
  getConfiguration: vi.fn().mockReturnValue({
    get: vi.fn(),
  }),
  createFileSystemWatcher: vi.fn(),
}

export const TestRunRequest = vi.fn()
export const CancellationTokenSource = vi.fn().mockImplementation(() => ({
  token: {
    onCancellationRequested: vi.fn(),
  },
  cancel: vi.fn(),
  dispose: vi.fn(),
}))

export const EventEmitter = vi.fn().mockImplementation(() => ({
  event: vi.fn(),
  fire: vi.fn(),
  dispose: vi.fn(),
}))

export const Uri = {
  file: (path: string) => ({ fsPath: path, path }),
  parse: (path: string) => ({ fsPath: path, path }),
}

export const Disposable = {
  from: vi.fn((...disposables: any[]) => {
    return {
      dispose: vi.fn(() => {
        disposables.forEach(d => d.dispose?.())
      })
    }
  })
}

export class RelativePattern {
  constructor(public baseUri: any, public pattern: string) {}
}

export const mockTestControllerInstance = {
  createRunProfile: vi.fn(),
  items: {
    replace: vi.fn(),
  },
  dispose: vi.fn(),
}

export const tests = {
  createTestController: vi.fn().mockReturnValue(mockTestControllerInstance)
}

export const TestRunProfileKind = {
  Run: 1,
  Debug: 2,
  Coverage: 3
}

export class Range {
  constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) {}
  get start() { return { line: this.startLine, character: this.startChar } }
  get end() { return { line: this.endLine, character: this.endChar } }
}
