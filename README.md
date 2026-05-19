# Lupa Test Explorer

VSCode extension for [Lupa](https://github.com/pawel-up/lupa) — a Vite-powered browser testing framework for Web Components and modern web interfaces.

Discover, run, and inspect Lupa tests directly from the VSCode Testing sidebar without leaving your editor.

## Features

- **Test Explorer** — Browse all test files, groups, and individual tests in the sidebar Testing panel.
- **Granular execution** — Run a single test, an entire group, or a whole file with one click.
- **Inline failures** — Failed tests show the assertion message inline in the editor gutter at the failing test line.
- **Gutter icons** — Clickable run buttons appear next to every `test()` call.
- **Auto-refresh** — The test tree updates automatically when test files or the Lupa config change.

## Requirements

Your project must have Lupa installed:

```sh
npm install --save-dev @pawel-up/lupa
```

And a `lupa.config.ts` (or `lupa.config.js`) in the workspace root. Run `npx lupa init` to scaffold one if you don't have it yet.

## Getting Started

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=PawelUchida-Psztyc.lupa-vscode).
2. Open a project that has Lupa installed and configured.
3. Open the **Testing** sidebar (beaker icon) — your tests will appear automatically.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `lupa.binPath` | `""` | Override the path to the `lupa` binary. Defaults to `node_modules/.bin/lupa` in the workspace root. |
| `lupa.verbose` | `false` | Log every NDJSON event to the **Lupa** output channel during test runs. Useful for debugging. |

## Config File Detection

The extension looks for your Lupa configuration in this order:

1. `lupa.config.ts` at the workspace root
2. `lupa.config.js` at the workspace root
3. The `--config` flag in the `"test"` script inside `package.json`

If none is found, the extension silently disables itself for that workspace.

## Output Channel

Open **View → Output** and select **Lupa** to see:

- Which binary and config file were detected
- Warnings when a test result can't be matched to a tree item
- Full NDJSON output from test runs (when `lupa.verbose` is enabled)

## Contributing

Issues and pull requests are welcome at [github.com/pawel-up/lupa-vscode](https://github.com/pawel-up/lupa-vscode).

## License

Apache-2.0
