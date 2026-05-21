# kli

_kommand line interface_

The **KDK CLI** (a.k.a. **kommand line interface** or **kli**) is a multiplexer for usual git/yarn/pnpm commands initially created to
develop [KDK](https://github.com/kalisio/kdk)-based applications more easily. It allows to quickly clone, install, link, unlink,
switch branch on all modules and applications using a single command. It can be used by any project requiring to manage a dependency
tree between different NodeJS modules stored in git repositories.

## Concepts

The CLI relies on a workspace file defining the dependency tree between your (KDK-based) application and modules like this:

```js
module.exports = {
  'feathers-webpush': {
    branch: 'master'
  },
  kdk: {
    dependencies: ['@kalisio/feathers-webpush'],
    branch: 'master'
  },
  kApp: {
    application: true,
    dependencies: ['@kalisio/kdk'],
    branch: 'master'
  }
}
```

Each key is a git repository, i.e. a module, monorepo or application, with the following available properties:

| Property | Description |
|---|---|
| `dependencies` | List of dependent modules to link |
| `branch` | Branch the module should be forced on whatever the target branch of the CLI |
| `application` | Indicates if this is the main application module, i.e. it has an `api` subfolder |
| `path` | Relative or absolute path to the repository on the local disk |
| `organization` | GitHub/GitLab organization the repository belongs to |
| `output` | Name of the repository folder on the local disk |
| `url` | Root URL to the remote git repositories (defaults to `https://github.com`) |
| `ignoreOptional` | Whether `yarn install` should run with `--ignore-optional` flag, defaults to `true` |
| `packages` | For monorepos: map of sub-packages with their own `dependencies` (see below) |
| `prefix` | Prefix to prepend to sub-package names when resolving their qualified name |
| `forceLink` | Force link/unlink even for pnpm-managed modules (see below) |

> [!TIP]
> The `branch` option can also target a git tag, typically for production releases.

### Monorepo support

For monorepos, the `packages` property maps each sub-package to its own dependency list:

```js
module.exports = {
  'feathers-ekosystem': {
    packages: {
      'feathers-import-export': {
        dependencies: ['@kalisio/feathers-s3']
      },
      'feathers-s3': {
        dependencies: []
      }
    },
    branch: 'master',
    path: process.env.KALISIO_DEVELOPMENT_DIR
  }
}
```

Sub-packages are discovered automatically from the `packages/` directory of the repository. Their qualified
name is resolved as `@<organization>/<prefix>-<name>` if a `prefix` is set, or `@<organization>/<name>`
otherwise.

### pnpm support

`kli` supports both yarn and pnpm workspaces. The package manager is auto-detected from the `packageManager`
field in each module's `package.json`.

> [!IMPORTANT]
> Each `package.json` in a monorepo (including sub-packages) should declare its `packageManager` field explicitly
> so `kli` can detect the right package manager for each directory.

By default, **pnpm modules are not linked globally** — `--link` has no effect on them unless `forceLink` is set.
This is because pnpm manages symlinks internally via its `node_modules` structure. Use `forceLink: true` in the
workspace file to opt in:

```js
module.exports = {
  'my-pnpm-module': {
    forceLink: true,
    branch: 'master'
  }
}
```

When a pnpm module is consumed by a yarn application, `kli` registers it in the yarn global link folder (or the folder
specified by `--link-folder`) so the yarn app can resolve it.

## Installation

### Prerequisites

Before you continue, you need to make sure that the following tools are installed on your system:

1. [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git)
2. [Node](https://nodejs.org/en/download)
3. [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/#debian-stable) and/or [pnpm](https://pnpm.io/installation)

### Production mode

```bash
npm install -g @kalisio/kli
```

### Development mode

To use the master branch locally:

```bash
git clone https://github.com/kalisio/kli.git
cd kli
yarn install
yarn link
```

## Usage

By default, all operations will take effect in the current working directory so that subdirectories named according to modules will be created or expected to already exist.

```bash
# Clone all repositories
kli workspace.js --clone
# Install dependencies in all modules and application
kli workspace.js --install
# Link required modules
kli workspace.js --link
# Unlink required modules
kli workspace.js --unlink
```

> [!IMPORTANT]
> By default all git operations target the `kalisio` organization. You can change this for the whole workspace using the `--organization` CLI option, or on specific modules using the `organization` property in the workspace file.

> [!IMPORTANT]
> All operations are performed relative to the CWD by default. You can change this for specific modules using the `path` property in the workspace file (relative to CWD or absolute).

> [!NOTE]
> Sample workspaces are provided in this repository.

Full CLI usage:

```bash
Usage: kli <workspacefile> [options]

Options:
  -V, --version                      output the version number
  -o, --organization <org>           GitHub organization or GitLab group owing the project (default: "kalisio")
  -u, --url <url>                    Git server base URL (default: "https://github.com")
  -c, --clone [branch]               Clone git repositories (with target branch) for all modules
  --shallow-clone                    Perform a shallow clone, ie. will not pull the whole repository history
  -p, --pull                         Pull git repositories for all modules
  -i, --install                      Install dependencies for all modules
  --check-files                      Use --check-files flag when running yarn install
  -l, --link                         Link packages
  --link-folder <folder>             Specify the folder to use to register yarn links
  -ul, --unlink                      Unlink packages
  -m, --modules <list>               Comma separated list of modules from the workspace to apply command on
  --command-output                   Show command output
  --fail-on-error                    Exit on error
  -h, --help                         output usage information
```

To enable verbose output for debugging:

```bash
export DEBUG=kli
kli workspace.js --link
```

## Tips

### Working on multiple versions

In order to be able to switch easily between different versions of NodeJS you usually use a version manager like [n](https://github.com/tj/n)/[nvm](https://github.com/creationix/nvm) under Linux/Mac or [nvm](https://github.com/coreybutler/nvm-windows) under Windows. However, as links are global to a Yarn installation it can be tricky to switch between different versions of the same repository using different NodeJS versions.

We recommend creating a different workspace for your application and clone each repository in a different folder for each version. Before switching to a new version you simply need to unlink the previous workspace:

```bash
# Currently using NodeJS v12
cd nodejs12
kli workspace-nodejs12.js --link
...
# Switching to NodeJS v16
kli workspace-nodejs12.js --unlink
nvm use 16.0.0
cd nodejs16
kli workspace-nodejs16.js --link
```

### Aliasing the KLI

When installing the **KLI** in development mode, it can be useful to create an alias in your `.bashrc`:

```bash
alias kli="node Path/to/kli/index.js"
```

## Contributing

Found a bug? Missing a feature? Check out our [contribution guidelines](https://kalisio.github.io/kdk/about/roadmap.html#contributing) for details.

## License

Licensed under the [MIT license](LICENSE).

Copyright (c) 2017-present [Kalisio](https://kalisio.com)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://kalisio.github.io/kalisioscope/kalisio/kalisio-logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://kalisio.github.io/kalisioscope/kalisio/kalisio-logo-light.svg">
  <img alt="Kalisio" src="https://kalisio.github.io/kalisioscope/kalisio/kalisio-logo-light.svg.png" height="96">
</picture>