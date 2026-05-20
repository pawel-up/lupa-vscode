import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { resolveLupaConfig } from '../src/config'

vi.mock('fs')

describe('config.ts', () => {
  const mockFolder = {
    uri: vscode.Uri.file('/mock/workspace'),
    name: 'workspace',
    index: 0,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.existsSync).mockReturnValue(false)
  })

  it('returns undefined if lupa bin is not found and no override', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined)
    } as any)
    expect(resolveLupaConfig(mockFolder)).toBeUndefined()
  })

  it('uses override binPath and returns undefined if config not found', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue('/custom/bin/lupa')
    } as any)
    expect(resolveLupaConfig(mockFolder)).toBeUndefined()
  })

  it('resolves config using lupa.config.ts', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue('/custom/bin/lupa')
    } as any)
    
    vi.mocked(fs.existsSync).mockImplementation((p: string | Buffer | URL) => {
      return p.toString().endsWith('lupa.config.ts')
    })

    const config = resolveLupaConfig(mockFolder)
    expect(config).toEqual({
      binPath: '/custom/bin/lupa',
      configPath: path.join('/mock/workspace', 'lupa.config.ts'),
      workspaceRoot: '/mock/workspace'
    })
  })

  it('resolves config using lupa.config.js', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue('/custom/bin/lupa')
    } as any)
    
    vi.mocked(fs.existsSync).mockImplementation((p: string | Buffer | URL) => {
      return p.toString().endsWith('lupa.config.js')
    })

    const config = resolveLupaConfig(mockFolder)
    expect(config).toEqual({
      binPath: '/custom/bin/lupa',
      configPath: path.join('/mock/workspace', 'lupa.config.js'),
      workspaceRoot: '/mock/workspace'
    })
  })

  it('resolves config using package.json fallback', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue(undefined) // test default bin discovery
    } as any)
    
    vi.mocked(fs.existsSync).mockImplementation((p: string | Buffer | URL) => {
      const pStr = p.toString()
      if (pStr.endsWith('node_modules/.bin/lupa')) return true
      if (pStr.endsWith('package.json')) return true
      if (pStr.endsWith('custom.config.ts')) return true
      return false
    })

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      scripts: { test: 'lupa --config custom.config.ts' }
    }))

    const config = resolveLupaConfig(mockFolder)
    expect(config).toEqual({
      binPath: path.join('/mock/workspace', 'node_modules/.bin/lupa'),
      configPath: path.resolve('/mock/workspace', 'custom.config.ts'),
      workspaceRoot: '/mock/workspace'
    })
  })

  it('returns undefined if package.json has no test script match', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn().mockReturnValue('/custom/bin/lupa')
    } as any)
    
    vi.mocked(fs.existsSync).mockImplementation((p: string | Buffer | URL) => {
      return p.toString().endsWith('package.json')
    })

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      scripts: { test: 'echo "hello"' }
    }))

    expect(resolveLupaConfig(mockFolder)).toBeUndefined()
  })
})
