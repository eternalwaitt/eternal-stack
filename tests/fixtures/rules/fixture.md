---
id: test-fixture-module
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
globs:
  - "src/**/*.ts"
  - "src/**/*.tsx"
description: "Fixture rule module for sync/init tests."
hosts: [claude, codex, cursor]
verify: "pnpm test"
---

# Test Fixture Rule

## Pattern example

```typescript
// CORRECT
import { helper } from '@/lib/helper'

// WRONG
import { helper } from '../../../lib/helper'
```

## verify

```bash
pnpm test
```
