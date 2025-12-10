# Testing

This guide introduces the testing strategy for flywave.gl and how to run tests.

## Test Types

flywave.gl uses multiple test types to ensure code quality:

- Unit Tests: Test individual functions and classes
- Integration Tests: Test interactions between modules
- Performance Tests: Evaluate rendering and computational performance
- Rendering Tests: Validate the correctness of visual output

### Testing Tools Used

- Jest: Testing framework
- Karma: Test runner
- Playwright: End-to-end testing
- Chrome DevTools Protocol: Performance testing

## Running Tests

### Running the Full Test Suite

```bash
# Run all unit tests using Chrome Headless
pnpm test
```

### Running Tests in Watch Mode

For development, run tests in watch mode to automatically re-run when files change:

```bash
# Run tests in watch mode
pnpm test:watch
```

### Running Tests in Browser

To run tests in an actual browser:

```bash
# Run tests in browser
pnpm test-browser
```

### Debugging Tests

To debug tests with Chrome DevTools:

```bash
# Run tests in debug mode
pnpm test-debug
```

## Test Configuration

### Jest Configuration

Jest configuration is defined in `jest.config.js` at the root of the project.

### Karma Configuration

Karma configuration is defined in `karma.conf.js`.

### Test Environment

Tests run in a headless Chrome environment by default, but can be configured to run in other browsers.

## Writing Tests

### Test Structure

Tests are organized in `__tests__` directories within each package.

### Unit Tests

Example unit test:

```typescript
import { MapView } from '../src/MapView';

describe('MapView', () => {
  it('should create a new instance', () => {
    const mapView = new MapView();
    expect(mapView).toBeInstanceOf(MapView);
  });
});
```

### Integration Tests

Integration tests verify interactions between components:

```typescript
import { MapView, TerrainDataSource } from '@flywave/flywave.gl';

describe('MapView with TerrainDataSource', () => {
  it('should add terrain data source', () => {
    const mapView = new MapView();
    const terrainDataSource = new TerrainDataSource();
    
    mapView.addDataSource(terrainDataSource);
    
    expect(mapView.getDataSources()).toContain(terrainDataSource);
  });
});
```

### Async Tests

For asynchronous operations:

```typescript
import { loadData } from '../src/dataLoader';

describe('Data Loader', () => {
  it('should load data asynchronously', async () => {
    const data = await loadData('test-data.json');
    expect(data).toBeDefined();
  });
});
```

## Test Coverage

### Generating Coverage Reports

To generate test coverage reports:

```bash
# Generate coverage report
pnpm test-cov
```

### Coverage Requirements

Aim for at least 80% test coverage for new features.

Coverage reports are generated in the `coverage/` directory.

## Performance Testing

### Running Performance Tests

To run performance tests:

```bash
# Run performance tests in Node.js environment
pnpm performance-test-node
```

### Browser Performance Tests

To run performance tests in browser:

```bash
# Run browser performance tests
pnpm performance-test-browser
```

## Rendering Tests

### Visual Regression Testing

Visual regression tests ensure consistent rendering:

```bash
# Run rendering tests
pnpm test-rendering
```

## Continuous Integration Testing

### CI Test Suite

All tests are run automatically in the CI pipeline:

```bash
# Run CI test suite
pnpm ci:test
```

This includes:
- Unit tests
- Integration tests
- Code linting
- Type checking

## Mocking and Stubbing

### Using Mocks

For mocking dependencies:

```typescript
import { mocked } from 'jest-mock';

jest.mock('../src/dataService');

describe('Component', () => {
  it('should use mocked service', () => {
    const mockService = mocked(dataService);
    mockService.fetchData.mockResolvedValue({ data: 'test' });
    
    // Test implementation
  });
});
```

### Stubbing External Dependencies

To stub external APIs:

```typescript
beforeEach(() => {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ data: 'test' })
    })
  );
});
```

## Test Best Practices

1. Write clear test descriptions: Use descriptive `it` and `describe` blocks
2. Test one thing at a time: Keep tests focused and isolated
3. Use meaningful assertions: Assert specific outcomes
4. Mock external dependencies: Isolate the code under test
5. Clean up after tests: Use `afterEach` to clean up state
6. Test edge cases: Include boundary conditions and error cases

## Troubleshooting

### Common Test Issues

1. Async test timeouts: Increase timeout values for slow tests:
   ```typescript
   it('slow test', async () => {
     // Test implementation
   }, 10000); // 10 second timeout
   ```

2. Mocking issues: Ensure mocks are properly configured before tests run

3. Environment issues: Verify test environment matches development environment

### Debugging Test Failures

To debug failing tests:

1. Run the specific failing test in isolation
2. Use `console.log` statements to trace execution
3. Run tests in debug mode with breakpoints
4. Check for race conditions in async tests

For persistent issues, consult the project documentation or seek help from the development team.