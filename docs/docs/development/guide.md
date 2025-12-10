# Development Guide

This guide will help you understand the development workflow of flywave.gl.

## Development Environment Setup

### System Requirements

- Node.js: >=22.15.0
- pnpm: >=9.0.0 (recommended)

### Installing Dependencies

After cloning the repository, run the following command to install dependencies:

```bash
pnpm install
```

This will install all required packages and set up the pnpm workspace.

## Development Workflow

### Starting the Development Server

Start the development server for the example project:

```bash
pnpm start
```

This command will start the development server and watch for file changes.

### Building the Project

To build the entire project:

```bash
pnpm run build
```

This will build all packages in the correct order.

### Running Tests

To run all tests:

```bash
pnpm test
```

To run tests in watch mode:

```bash
pnpm test:watch
```

## Project Structure

The flywave.gl project follows a monorepo structure:

```
flywave.gl/
├── @flywave/
│   ├── mapview/              # Core map rendering engine
│   ├── terrain-datasource/   # Terrain data handling
│   ├── geojson-datasource/   # GeoJSON data source
│   ├── 3dtile-datasource/    # 3D Tiles data source
│   ├── vectortile-datasource/ # Vector tile data source
│   ├── draw-controls/        # Drawing tools and controls
│   ├── map-controls/         # Map interaction controls
│   └── inspector/            # Debugging and inspection tools
├── docs/                     # Documentation
├── examples/                 # Example projects
└── scripts/                  # Utility scripts
```

## Package Development

### Creating a New Package

To create a new package:

1. Create a new directory under `@flywave/`
2. Initialize the package with `pnpm init`
3. Add necessary dependencies
4. Update the workspace configuration in `pnpm-workspace.yaml`

### Package Dependencies

Packages can depend on other packages within the monorepo. Specify dependencies in the package's `package.json`:

```json
{
  "dependencies": {
    "@flywave/mapview": "workspace:*",
    "@flywave/terrain-datasource": "workspace:*"
  }
}
```

## Code Quality

### Linting

Run ESLint to check code quality:

```bash
pnpm run lint
```

### Formatting

Format code with Prettier:

```bash
pnpm run format
```

### Type Checking

Perform TypeScript type checking:

```bash
pnpm run typecheck
```

## Git Workflow

### Branching Strategy

- main: Production-ready code
- develop: Development branch
- feature/: Feature branches
- hotfix/: Hotfix branches

### Commit Messages

Follow the conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types include:
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes
- refactor: Code refactoring
- test: Test additions or updates
- chore: Maintenance tasks

### Pull Requests

1. Create a feature branch from develop
2. Make your changes
3. Write tests if applicable
4. Update documentation
5. Submit a pull request to develop

## Release Process

### Versioning

flywave.gl follows semantic versioning (SemVer):

- MAJOR: Breaking changes
- MINOR: New features
- PATCH: Bug fixes

### Publishing

To publish a new version:

1. Update version numbers in package.json files
2. Create a release branch
3. Run the build process
4. Publish to npm registry
5. Create a GitHub release

## Testing

### Test Structure

Tests are organized in `__tests__` directories within each package.

### Writing Tests

Use Jest for unit tests:

```typescript
import { MapView } from '../src/MapView';

describe('MapView', () => {
  it('should create a new instance', () => {
    const mapView = new MapView();
    expect(mapView).toBeInstanceOf(MapView);
  });
});
```

### Test Coverage

Aim for at least 80% test coverage for new features.

## Documentation

### Updating Documentation

Documentation is located in the `docs/` directory. Update relevant files when making changes.

### API Documentation

API documentation is generated from JSDoc comments in the source code.

## Continuous Integration

### CI Pipeline

The CI pipeline runs on every pull request and includes:

- Code linting
- Type checking
- Unit tests
- Build verification

### Deployment

Documentation is automatically deployed to the website on successful merges to main.