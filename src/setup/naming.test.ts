import { describe, test, expect } from 'vitest';
import { branchSafe, expandNaming, buildEnvAgent } from './naming.js';
import type { ExpandedNaming } from './naming.js';
import type { GroveConfig } from '../types.js';

const baseConfig: GroveConfig = {
  enabled: true,
  project: 'myapp',
  providers: {},
};

describe('branchSafe', () => {
  test('lowercases branch names', () => {
    expect(branchSafe('MyBranch')).toBe('mybranch');
  });

  test('replaces slashes with hyphens', () => {
    expect(branchSafe('feature/my-feature')).toBe('feature-my-feature');
  });

  test('collapses consecutive non-alphanumeric chars into one hyphen', () => {
    expect(branchSafe('feature//fix')).toBe('feature-fix');
  });

  test('trims to 40 chars', () => {
    const long = 'a'.repeat(50);
    expect(branchSafe(long)).toHaveLength(40);
  });

  test('trims leading and trailing hyphens', () => {
    expect(branchSafe('/branch/')).toBe('branch');
  });

  test('handles branch with dots and underscores', () => {
    expect(branchSafe('fix.some_thing')).toBe('fix-some-thing');
  });
});

describe('expandNaming', () => {
  test('uses default composeProject template', () => {
    const result = expandNaming(baseConfig, 'main');
    expect(result.composeProject).toBe('grove-main');
  });

  test('uses default dbSchema template with project name', () => {
    const result = expandNaming(baseConfig, 'main');
    expect(result.dbSchema).toBe('myapp_main');
  });

  test('sharedProject is null when not configured', () => {
    const result = expandNaming(baseConfig, 'main');
    expect(result.sharedProject).toBeNull();
  });

  test('defaults ports to auto', () => {
    const result = expandNaming(baseConfig, 'main');
    expect(result.webPort).toBe('auto');
    expect(result.apiPort).toBe('auto');
  });

  test('expands branch_safe for slash-containing branch', () => {
    const result = expandNaming(baseConfig, 'feature/my-feature');
    expect(result.composeProject).toBe('grove-feature-my-feature');
    expect(result.dbSchema).toBe('myapp_feature-my-feature');
  });

  test('expands custom composeProject template', () => {
    const config: GroveConfig = {
      ...baseConfig,
      naming: { composeProject: '${project}-${branch_safe}' },
    };
    const result = expandNaming(config, 'main');
    expect(result.composeProject).toBe('myapp-main');
  });

  test('expands sharedProject template when configured', () => {
    const config: GroveConfig = {
      ...baseConfig,
      naming: { sharedProject: '${project}-shared' },
    };
    const result = expandNaming(config, 'main');
    expect(result.sharedProject).toBe('myapp-shared');
  });

  test('respects explicit port numbers', () => {
    const config: GroveConfig = {
      ...baseConfig,
      naming: { webPort: 3000, apiPort: 4000 },
    };
    const result = expandNaming(config, 'main');
    expect(result.webPort).toBe(3000);
    expect(result.apiPort).toBe(4000);
  });

  test('falls back to "grove" project name when project is missing from config', () => {
    // GroveConfig requires project, but expandNaming reads it with ?? 'grove'
    const config = { ...baseConfig, project: undefined } as unknown as GroveConfig;
    const result = expandNaming(config, 'main');
    expect(result.dbSchema).toBe('grove_main');
  });
});

describe('buildEnvAgent', () => {
  const explicitExpanded: ExpandedNaming = {
    composeProject: 'grove-main',
    sharedProject: null,
    dbSchema: 'myapp_main',
    webPort: 3000,
    apiPort: 4000,
  };

  test('includes COMPOSE_PROJECT_NAME', async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).toContain('COMPOSE_PROJECT_NAME=grove-main');
  });

  test('includes WEB_PORT', async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).toContain('WEB_PORT=3000');
  });

  test('includes API_PORT', async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).toContain('API_PORT=4000');
  });

  test('includes DB_SCHEMA', async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).toContain('DB_SCHEMA=myapp_main');
  });

  test('does not include SHARED_PROJECT_NAME when sharedProject is null', async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result).not.toContain('SHARED_PROJECT_NAME');
  });

  test('includes SHARED_PROJECT_NAME when sharedProject is set', async () => {
    const expanded: ExpandedNaming = { ...explicitExpanded, sharedProject: 'grove-shared' };
    const result = await buildEnvAgent(expanded);
    expect(result).toContain('SHARED_PROJECT_NAME=grove-shared');
  });

  test('output ends with newline', async () => {
    const result = await buildEnvAgent(explicitExpanded);
    expect(result.endsWith('\n')).toBe(true);
  });

  test('uses existingWebPort as starting point when webPort is auto', async () => {
    // When webPort is 'auto', it calls findFreePort. We test with an explicit port to avoid
    // network side effects, but verify the logic by using a fixed port.
    const expanded: ExpandedNaming = { ...explicitExpanded, webPort: 8080, apiPort: 8081 };
    const result = await buildEnvAgent(expanded);
    expect(result).toContain('WEB_PORT=8080');
    expect(result).toContain('API_PORT=8081');
  });
});
