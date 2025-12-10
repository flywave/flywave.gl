# Building Source Code

This guide will introduce how to build the flywave.gl project source code.

## Build System Overview

flywave.gl uses a modern build toolchain:

- TypeScript Compiler (tsc): Compiles TypeScript source code
- Webpack: Module bundling and asset processing
- pnpm: Workspace management and dependency installation

## Build Commands

### Building All Modules

```bash
# Build all workspace packages and create final bundles
pnpm build
```

This command will build all packages in the correct order, respecting their dependencies.

### Building Individual Packages

To build a specific package:

```bash
# Build a specific package
pnpm --filter @flywave/mapview build
```

### Building Examples

To build the example projects:

```bash
# Build example projects
pnpm build-examples
```

### Building the Main Bundle

To build the main flywave.gl bundle:

```bash
# Build the main bundle
pnpm build-bundle
```

## Development Builds

### Watch Mode

For development, you can build in watch mode to automatically rebuild when files change:

```bash
# Build in watch mode
pnpm build:watch
```

### Incremental Builds

To speed up subsequent builds, incremental builds are enabled by default:

```bash
# Incremental build
pnpm build --incremental
```

## Build Configuration

### TypeScript Configuration

TypeScript compilation is configured through `tsconfig.json` files in each package.

### Webpack Configuration

Webpack configuration files are located in the `config/webpack/` directory.

### Environment Variables

Build behavior can be customized using environment variables:

```bash
# Set build mode
NODE_ENV=production pnpm build

# Enable source maps
GENERATE_SOURCEMAP=true pnpm build
```

## Output Directories

Build outputs are placed in the following directories:

- dist/: Main distribution files
- lib/: Compiled TypeScript files
- esm/: ES module builds
- cjs/: CommonJS builds

## Optimizations

### Tree Shaking

The build system enables tree shaking to eliminate unused code:

```bash
# Build with tree shaking
pnpm build --mode production
```

### Minification

Production builds automatically minify JavaScript and CSS:

```bash
# Explicitly enable minification
pnpm build --minify
```

### Code Splitting

Code splitting is configured to optimize loading performance:

```bash
# Build with code splitting
pnpm build --split
```

## Cross-Platform Builds

### Building for Different Platforms

To build for specific platforms:

```bash
# Build for Node.js
pnpm build:node

# Build for browser
pnpm build:browser

# Build for both
pnpm build:universal
```

## Debugging Builds

### Source Maps

Source maps are generated to aid in debugging:

```bash
# Generate detailed source maps
pnpm build --sourcemap
```

### Verbose Output

For detailed build information:

```bash
# Verbose build output
pnpm build --verbose
```

## Performance Considerations

### Build Caching

Build caching is enabled to speed up subsequent builds:

```bash
# Enable build caching
pnpm build --cache
```

### Parallel Builds

Packages are built in parallel when possible:

```bash
# Control parallelism
pnpm build --concurrency 4
```

## Troubleshooting

### Common Build Issues

1. TypeScript errors: Check type definitions and ensure all dependencies are installed
2. Module resolution issues: Verify import paths and package dependencies
3. Memory issues: Increase Node.js memory limit:
   ```bash
   NODE_OPTIONS="--max-old-space-size=4096" pnpm build
   ```

### Cleaning Builds

To start with a clean slate:

```bash
# Clean build artifacts
pnpm clean

# Rebuild everything
pnpm build
```

## Continuous Integration Builds

### CI-Specific Builds

For CI environments:

```bash
# CI build
pnpm ci:build
```

This command optimizes the build process for CI environments.

## Custom Builds

### Extending Build Process

You can extend the build process by adding custom scripts in the `scripts/` directory.

### Build Hooks

Pre-build and post-build hooks can be configured in `package.json`:

```json
{
  "scripts": {
    "prebuild": "node scripts/prebuild.js",
    "postbuild": "node scripts/postbuild.js"
  }
}
```

## Best Practices

1. Incremental builds: Use watch mode during development
2. Production builds: Always test production builds before deployment
3. Code splitting: Optimize for loading performance
4. Minification: Enable for production builds
5. Source maps: Generate for easier debugging
6. Caching: Utilize build caching for faster builds