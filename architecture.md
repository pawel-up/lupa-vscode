# Lupa VSCode

Lupa is a new frond end testing framework that brings new DX to front end testing. It has new, ergonomic API allowing developers to write beautiful tests.

The Lupa VSCode extension allows developers to discover and run tests from the VSCode UI.

## UI integration

- **Test Explorer UI**: Discover, run, and debug specific tests directly from the VSCode sidebar.
- **Gutter Icons**: Clickable play/debug buttons next to test() blocks.
- **Inline Errors**: Display test failure messages and stack traces inline within the editor.

## Interaction Design

When the developer opens the testing side panel, the Lupa extension should list all available test cases. We don't want to list tests that are not configured for Lupa. That is why we need to scan for the correct configuration (or use Lupa's CLI).

The tree-list is grouped by:

- test suite file
- test groups (optional, Lupa doesn't support nested groups)
- finally, test units.

The user can activate tests on any level. If they run a test file, the entire file is executed. If they run a group, only that group is executed. When they run a single test - that test is executed.

## Running tests

When a test run, the tests that are executed will show a loading state. After test run:

- if there was an error: the list item turns into an error state symbolised by the red error icon.
- if there was no error: the list item goes back to the normal state.

I am willing to discuss options here as I am not 100% familiar with VSCode APIs.

## Tests configuration

By default, Lupa creates the `lupa.config.[js|ts]` file during initialization. The user can change that file to anything, but then they have to point to the config file when executing tests. We should check the "test" command in the `package.json` file to discover the configuration file, if the default is missing.

The CLI accepts the `-c, --config <path>` option.

## Test CLI

### Run tests

```sh
lupa test
```

Defined in ~/workspace/pawel-up/lupa/bin/cli/commands/test.ts

### List tests

```sh
lupa list
```

Defined in ~/workspace/pawel-up/lupa/bin/cli/commands/list.ts

We likely can use the CLI to run test, but we can use the programmatic API to execute them.

## Open questions

- How will we visualize the error itself? The error details probably are printed in the terminal, but do we need to render errors in the test list?
- Is there anything I didn't think of related to DX in VSCode?
- Will this extension work in all sort of VSCode forks like Cursor or Antigravity?
