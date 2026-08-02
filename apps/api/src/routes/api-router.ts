import { Router } from 'express';
import type { CatalogController } from '../controllers/catalog-controller.js';
import type { StatusController } from '../controllers/status-controller.js';

/**
 * Routes name the addresses; controllers do the work. Nothing else belongs here.
 */
export function createApiRouter(controllers: {
  statusController: StatusController;
  catalogController: CatalogController;
}): Router {
  const router = Router();

  router.get('/status', controllers.statusController.read);
  router.get('/models', controllers.catalogController.listModels);

  return router;
}
