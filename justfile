# List available recipes
default:
    @just --list

# Run tests
[group: 'dev']
test:
    bun test

# Run tests in watch mode
[group: 'dev']
test-watch:
    bun test --watch

# Format code with prettier
[group: 'dev']
format:
    bunx prettier --write .

# Link package globally for local testing
[group: 'dev']
link:
    bun link

# Dry-run npm publish to check package contents
[group: 'release']
publish-dry:
    npm publish --dry-run

# Publish to npm
[group: 'release']
publish:
    npm publish

# Run CI locally with act (Linux only - act doesn't support Windows/macOS runners)
[group: 'ci']
ci:
    act push

# Run CI test job locally
[group: 'ci']
ci-test:
    act push -j test

# Run CI lint job locally
[group: 'ci']
ci-lint:
    act push -j lint

# Run CI with verbose output
[group: 'ci']
ci-verbose:
    act push -v

# List available CI workflows
[group: 'ci']
ci-list:
    act -l

# Deploy website to Vercel (offmyport.dev)
[group: 'release']
deploy-web:
    cd web && vc --prod
