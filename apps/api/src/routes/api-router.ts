import express, { Router, type RequestHandler } from 'express';
import type { EditorGate } from '../access/editor-gate.js';
import type { CatalogController } from '../controllers/catalog-controller.js';
import type { ScanController } from '../controllers/scan-controller.js';
import type { PositionController } from '../controllers/position-controller.js';
import type { SessionController } from '../controllers/session-controller.js';
import type { StatusController } from '../controllers/status-controller.js';
import type { TavolaController } from '../controllers/tavola-controller.js';

/**
 * Routes name the addresses; controllers do the work. Nothing else belongs here — except the
 * one thing that is genuinely a property of an address rather than of a handler, which is who
 * is allowed to ask for it.
 *
 * **The archive is members-only, so all of it is behind the gate — not only the images.** The
 * scans are the obvious thing to protect, but a Tavola's number, its two names and the
 * factory's own Sezione and Gruppo are the Club's archive too, and an open catalog is a
 * catalog a search engine indexes. What is left open is exactly what has to be: the status the
 * footer reports, and the session routes themselves, since asking to be let in cannot require
 * already being in.
 *
 * Ticket 15 replaces *who* the gate admits — an Account with a live Membership, re-checked on
 * every request — not *what* it stands in front of.
 */
export function createApiRouter(dependencies: {
  editorGate: EditorGate;
  maxScanBytes: number;
  statusController: StatusController;
  sessionController: SessionController;
  catalogController: CatalogController;
  tavolaController: TavolaController;
  positionController: PositionController;
  scanController: ScanController;
}): Router {
  const {
    editorGate,
    statusController,
    sessionController,
    catalogController,
    tavolaController,
    positionController,
    scanController,
  } = dependencies;

  const router = Router();
  const editorsOnly: RequestHandler = editorGate.requireEditor;

  // Open, and only these. The status strip has to be able to say the database is unreachable
  // to somebody who cannot sign in because the database is unreachable.
  router.get('/status', statusController.read);
  router.get('/session', sessionController.read);
  router.post('/session', sessionController.signIn);
  router.delete('/session', sessionController.signOut);

  router.use(editorsOnly);

  router.get('/models', catalogController.listModels);
  router.get('/models/:modelId', catalogController.readModel);
  router.post('/models', catalogController.createModel);

  router.get('/categories', tavolaController.listCategories);
  router.get('/tavole/:tavolaId', tavolaController.read);
  router.post('/models/:modelId/tavole', tavolaController.create);

  // **One click is one request**, which is why the Position is named by its printed number here
  // rather than by an id: at the moment an Editor clicks the drawing they know what the factory
  // printed, and whether the archive has heard of that number yet is the archive's problem. A
  // tool that cost a lookup and then a write would cost twice as many evenings.
  router.post('/tavole/:tavolaId/marks', positionController.placeMark);
  // A number the catalog lists but the drawing does not show.
  router.post('/tavole/:tavolaId/positions', positionController.addPosition);
  router.delete('/positions/:positionId', positionController.removePosition);
  router.patch('/marks/:markId', positionController.moveMark);
  router.delete('/marks/:markId', positionController.removeMark);

  // The scan is the body, and **nothing here trusts what it says it is**: the parser claims
  // every content type and ingest decides what the bytes actually are. A `.tif` off a flatbed
  // routinely arrives with no type at all, and refusing that would be exactly the conversation
  // about image formats an Editor is promised they will never have (story 94).
  router.put(
    '/tavole/:tavolaId/scan',
    express.raw({ type: () => true, limit: dependencies.maxScanBytes }),
    scanController.upload,
  );

  router.get('/scans/:scanId/:variant', scanController.readImage);

  return router;
}
