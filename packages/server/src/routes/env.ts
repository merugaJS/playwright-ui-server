import { Router } from 'express';
import type { ProjectInfo } from '../project-scanner.js';
import { EnvManager } from '../services/env-manager.js';

export function createEnvRouter(projectInfo: ProjectInfo): Router {
  const router = Router();
  const envManager = new EnvManager(projectInfo);

  /**
   * GET /api/env
   * Returns discovered env vars with their merged (masked) values.
   * Query param: ?unmask=true to show raw values.
   */
  router.get('/', (req, res) => {
    const unmask = req.query.unmask === 'true';
    const vars = envManager.getEnvVars(!unmask);
    res.json({ vars });
  });

  /**
   * PUT /api/env
   * Update env var overrides.
   * Body: { vars: { VAR_NAME: "value", ... } }
   * Set a value to empty string "" to remove an override.
   */
  router.put('/', (req, res) => {
    const { vars } = req.body;

    if (!vars || typeof vars !== 'object' || Array.isArray(vars)) {
      res.status(400).json({ error: 'Body must contain a "vars" object with key-value pairs.' });
      return;
    }

    // Validate all values are strings
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value !== 'string') {
        res.status(400).json({ error: `Value for "${key}" must be a string.` });
        return;
      }
    }

    try {
      envManager.updateOverrides(vars as Record<string, string>);
      const updated = envManager.getEnvVars(true);
      res.json({ success: true, vars: updated });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to update env vars: ${err.message}` });
    }
  });

  return router;
}
