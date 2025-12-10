# Environment Setup

This guide will help you set up the development environment for flywave.gl.

## System Requirements

- Operating System: Windows, macOS, or Linux
- Node.js: >=22.15.0 (LTS version recommended)
- pnpm: >=9.0.0 (recommended)
- Memory: At least 8GB RAM (16GB+ recommended for development)
- Disk Space: At least 2GB available space

## Installing Node.js

### Using Official Node.js Installer

1. Visit the [Node.js website](https://nodejs.org/)
2. Download and install the LTS version (>=22.15.0)

### Using Version Management Tools

#### Using nvm (Recommended)

```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install and use the required Node.js version
nvm install 22.15.0
nvm use 22.15.0
```

#### Using fnm (Fast Node Manager)

```bash
# Install fnm
curl -fsSL https://fnm.vercel.app/install | bash

# Install and use the required Node.js version
fnm install 22.15.0
fnm use 22.15.0
```

## Installing pnpm

Install pnpm globally:

```bash
npm install -g pnpm
```

Verify the installation:

```bash
pnpm --version
```

## Cloning the Repository

Clone the flywave.gl repository:

```bash
git clone https://github.com/flywave/flywave.gl.git
cd flywave.gl
```

## Installing Dependencies

Install all project dependencies:

```bash
pnpm install
```

This will install dependencies for all packages in the monorepo.

## Building the Project

Build the entire project:

```bash
pnpm run build
```

This command will build all packages in the correct order.

## Running Tests

Run all tests to verify the setup:

```bash
pnpm test
```

## Development Workflow

### Starting the Development Server

To start the development server for documentation:

```bash
cd docs
pnpm start
```

### Working with Examples

To work with examples:

```bash
cd @flywave/flywave-examples
pnpm start
```

### Package Development

For developing individual packages, you can use:

```bash
# Build in watch mode
pnpm run build:watch

# Run tests in watch mode
pnpm test:watch
```

## IDE Setup

### VS Code

Recommended extensions for VS Code:

- TypeScript Importer: Auto import for TypeScript
- ESLint: Linting support
- Prettier: Code formatting
- GitLens: Enhanced Git capabilities

### WebStorm

WebStorm has built-in support for TypeScript, ESLint, and Prettier.

## Troubleshooting

### Common Issues

1. Permission errors: If you encounter permission errors, try:
   ```bash
   sudo chown -R $(whoami) ~/.npm
   ```

2. Node.js version issues: Ensure you're using the correct Node.js version:
   ```bash
   node --version
   nvm use 22.15.0
   ```

3. Dependency installation failures: Clear pnpm cache:
   ```bash
   pnpm store prune
   ```

### Verifying Setup

To verify your development environment is correctly set up:

```bash
# Check Node.js version
node --version

# Check pnpm version
pnpm --version

# Run a simple test
pnpm test --filter @flywave/mapview
```

## Next Steps

After setting up your environment, you can:

- [Read the Development Guide](./guide.md) - Learn about the project architecture
- [Explore Development Scripts](./scripts.md) - Understand available development tools
- [Contribute to the Project](../../README.md#contributing) - Learn how to contribute