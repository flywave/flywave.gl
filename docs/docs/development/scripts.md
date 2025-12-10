# Development Scripts

This guide introduces the available development script commands in the flywave.gl project.

## Build and Development

- `pnpm build` - Build all workspace packages and create final bundles
- `pnpm build-examples` - Build example projects
- `pnpm build-bundle` - Build the flywave.gl main bundle
- `pnpm build-tests` - Build test projects
- `pnpm start` - Start the development server for example projects
- `pnpm start-tests` - Start the development server for test projects

## Test Commands

- `pnpm test` - Run unit tests (using headless Chrome)
- `pnpm test-debug` - Run tests in debug mode (using Chrome)
- `pnpm test-browser` - Run tests in the browser
- `pnpm test-cov` - Run tests and generate coverage report
- `pnpm performance-test-node` - Run performance tests in Node.js environment
- `pnpm karma-headless` - Run Karma tests using headless Chrome
- `pnpm karma-headless-firefox` - Run Karma tests using headless Firefox

## Code Quality

- `pnpm lint` - Run ESLint to check code quality
- `pnpm lint-fix` - Run ESLint and automatically fix issues
- `pnpm format` - Format code with Prettier
- `pnpm typecheck` - Perform TypeScript type checking

## Documentation

- `pnpm docs:start` - Start the documentation development server
- `pnpm docs:build` - Build the documentation site
- `pnpm docs:serve` - Serve the built documentation site

## Utilities

- `pnpm clean` - Clean build artifacts and node_modules
- `pnpm bootstrap` - Bootstrap the project (install dependencies)
- `pnpm audit` - Run security audit
- `pnpm outdated` - Check for outdated dependencies

## Package Management

- `pnpm publish-packages` - Publish packages to npm registry
- `pnpm version-packages` - Update package versions
- `pnpm link-packages` - Link packages for local development

## Continuous Integration

- `pnpm ci:test` - Run tests for CI environment
- `pnpm ci:build` - Build for CI environment
- `pnpm ci:lint` - Run linting for CI environment

## Debugging

- `pnpm debug:start` - Start development server with debugging enabled
- `pnpm debug:test` - Run tests with debugging enabled

## Environment Specific

- `pnpm dev` - Development mode commands
- `pnpm prod` - Production mode commands

## Custom Scripts

You can also create custom scripts in the `scripts/` directory for specific development tasks.

## Running Scripts

To run any of these scripts, use:

```bash
pnpm run <script-name>
```

For example:

```bash
pnpm run build
pnpm run test
pnpm run lint
```

## Script Composition

Many scripts are composed of other scripts. For example, the `build` script may run several sub-scripts to build different parts of the project.

## Configuration

Scripts can be configured through:

1. `package.json` script definitions
2. Environment variables
3. Configuration files in the `config/` directory
4. Command-line arguments

## Best Practices

1. Use descriptive script names: Make it clear what each script does
2. Keep scripts simple: Break complex operations into smaller scripts
3. Document scripts: Add comments explaining what each script does
4. Test scripts: Ensure scripts work consistently across different environments
5. Use cross-platform commands: Prefer npm/pnpm scripts over shell-specific commands

## Troubleshooting

If a script fails:

1. Check the error message for specific details
2. Verify all dependencies are installed
3. Check if the required environment variables are set
4. Ensure you're running the script from the correct directory
5. Try running with increased verbosity to get more details

For persistent issues, consult the project documentation or seek help from the development team.