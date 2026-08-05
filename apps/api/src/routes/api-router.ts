import express, { Router, type RequestHandler } from 'express';
import type { Gate } from '../access/gate.js';
import type { BulkPasteController } from '../controllers/bulk-paste-controller.js';
import type { CatalogController } from '../controllers/catalog-controller.js';
import type { ClubController } from '../controllers/club-controller.js';
import type { RosterController } from '../controllers/roster-controller.js';
import type { PartController } from '../controllers/part-controller.js';
import type { PartRecordController } from '../controllers/part-record-controller.js';
import type { PhotographController } from '../controllers/photograph-controller.js';
import type { ScanController } from '../controllers/scan-controller.js';
import type { SearchController } from '../controllers/search-controller.js';
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
 * footer reports, and the ways in — signing in, asking for a reset link, and redeeming one —
 * since asking to be let in cannot require already being in.
 *
 * **Two gates stand here, not one.** The archive is behind a live Membership, checked on every
 * request; the roster and the Club are behind the Administrator role and deliberately *not*
 * behind a Membership, because administering the association is not reading the archive and an
 * Administrator who forgot to pay must not be locked out of the screen that records payment.
 */
export function createApiRouter(dependencies: {
  gate: Gate;
  maxScanBytes: number;
  maxPhotographBytes: number;
  statusController: StatusController;
  sessionController: SessionController;
  rosterController: RosterController;
  clubController: ClubController;
  searchController: SearchController;
  catalogController: CatalogController;
  tavolaController: TavolaController;
  positionController: PositionController;
  partController: PartController;
  partRecordController: PartRecordController;
  bulkPasteController: BulkPasteController;
  photographController: PhotographController;
  scanController: ScanController;
}): Router {
  const {
    gate,
    statusController,
    sessionController,
    rosterController,
    clubController,
    searchController,
    catalogController,
    tavolaController,
    positionController,
    partController,
    partRecordController,
    bulkPasteController,
    photographController,
    scanController,
  } = dependencies;

  const router = Router();
  const editorsOnly: RequestHandler = gate.requireEditor;
  const administratorsOnly: RequestHandler = gate.requireAdministrator;

  // Open, and only these. The status strip has to be able to say the database is unreachable
  // to somebody who cannot sign in because the database is unreachable.
  router.get('/status', statusController.read);
  router.get('/session', sessionController.read);
  router.post('/session', sessionController.signIn);
  router.delete('/session', sessionController.signOut);

  // **The way back in.** All three are open and all three are careful about what they answer: a
  // reset request says nothing about whether the address is on the roster, and a link that never
  // existed is refused in the same words as one already spent.
  //
  // The token travels in the **body** rather than in the path, and that is not decoration: an
  // address is written to the access log of everything it passes through, and the secret in a
  // reset link is the one thing that must not be sitting in a log file a week later.
  router.post('/password-resets', sessionController.requestPasswordReset);
  router.post('/password-setups/inspect', sessionController.inspectPasswordSetup);
  router.post('/password-setups', sessionController.setPassword);

  // **Keeping the roster and the Club** — an Administrator's, and behind the role rather than
  // behind a Membership. Above the archive's own gate below, so a lapsed Administrator can still
  // record the payment that un-lapses somebody.
  router.get('/roster', administratorsOnly, rosterController.list);
  router.post('/roster', administratorsOnly, rosterController.add);
  router.patch('/roster/:accountId', administratorsOnly, rosterController.correct);
  // Sending the invitation again, to somebody who missed it or whose link expired (story 5).
  router.post('/roster/:accountId/invitation', administratorsOnly, rosterController.invite);
  // Money that arrived by bank transfer. A new term, never an edit of an old one.
  router.post('/roster/:accountId/payments', administratorsOnly, rosterController.recordPayment);

  router.get('/club', administratorsOnly, clubController.read);
  router.patch('/club', administratorsOnly, clubController.correct);

  // Everything below is the archive, and the archive is what a live Membership buys.
  router.use(gate.requireLiveMembership);

  /**
   * **Reading the archive is what a Membership buys; changing it is an Editor's job.**
   *
   * Stated as a rule about the method rather than repeated on thirty-five addresses, because it
   * is genuinely true of every one of them: everything under here that is not a `GET` writes to
   * the archive or is an Editor's tool for deciding what to write. Ticket 14 introduced Members,
   * who could otherwise reach every write below; ticket 15 owns proving the whole surface.
   */
  router.use((request, response, next) => {
    if (request.method === 'GET') {
      next();
      return;
    }
    editorsOnly(request, response, next);
  });

  // **The way in that does not start at the car** (ticket 22). It is behind the gate like
  // everything else, and here that is load-bearing rather than consistent: a search address
  // outside it would hand anyone the archive a number at a time, which is exactly the thing the
  // Club's members contribute on the understanding will not happen (ADR 0006).
  router.get('/search', searchController.find);

  router.get('/models', catalogController.listModels);
  router.get('/models/:modelId', catalogController.readModel);
  // **Where the work stands across one car's drawings**, counted rather than assembled. A
  // Tavola's own progress has no address here on purpose: the sheet and its index are already in
  // the browser that is showing them, so asking again would be a third request to learn what two
  // have just finished saying.
  router.get('/models/:modelId/progress', catalogController.readModelProgress);
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

  // **What belongs with a number**, in the two shapes it comes in — hung off the Tavola because
  // both are properties of the sheet: a Sub-assembly holds numbers on one drawing, and a link
  // joins two of them. Neither has an address of its own to be read at; both are read with the
  // sheet, and what is here is only the writing.
  //
  // Each has a way back out for the same reason a Mark does (ticket 05): a Sub-assembly is
  // recorded in one press, so undoing it has to cost about one press too. Taking one number out
  // undoes the press that put it in; dissolving undoes an eleven-number Sub-assembly named wrong,
  // which is otherwise eleven presses.
  router.post('/tavole/:tavolaId/sub-assemblies', positionController.putInSubAssembly);
  router.delete('/positions/:positionId/sub-assembly', positionController.takeOutOfSubAssembly);
  // Dissolving the name. The numbers that were in it stay on the sheet.
  router.delete('/sub-assemblies/:subAssemblyId', positionController.dissolveSubAssembly);

  router.post('/tavole/:tavolaId/related-positions', positionController.relate);
  // By the **link's** id and not by a pair, which is the symmetry made reachable: there is one
  // row, both ends report the same id for it, and removing it from either end removes the one
  // link there is.
  router.delete('/related-positions/:linkId', positionController.unrelate);

  // **What sits at a number**, read one Position at a time rather than carried on every Position
  // of the sheet: a Tavola may hold two hundred of them, each with several Parts and each Part's
  // other appearances, and a member reads one. Recording a Part goes through the Tavola, because
  // a Listing is a Part's appearance on a *drawing* — the Position is optional.
  router.get('/positions/:positionId/listings', partController.listAtPosition);
  // The sheet's own text, read whole: the list beside the drawing a member works *from* rather
  // than *to* (story 46), and the only thing that knows which numbers have nothing at them yet.
  router.get('/tavole/:tavolaId/listings', partController.listOnTavola);
  router.post('/tavole/:tavolaId/listings', partController.record);

  // **A whole catalog page at once, and a way back out into a spreadsheet** (ticket 12). Hung
  // off the Tavola because a paste is one drawing's worth of rows and an export is one drawing:
  // this is editing convenience per sheet, and deliberately not the catalog importer (ADR 0005).
  //
  // The preview has an address of its own rather than a flag on the write. What it does — read
  // the archive and answer — is what a `GET` does, and an address that writes two hundred rows
  // when a field is set wrong is one press away from a very bad afternoon. It is a `POST` only
  // because the text it reads is far too long to be a query string.
  router.post('/tavole/:tavolaId/paste/preview', bulkPasteController.preview);
  router.post('/tavole/:tavolaId/paste', bulkPasteController.apply);
  // `.csv` in the address and not only in the header, so that a file saved out of a browser
  // arrives in the spreadsheet it was meant for rather than in a text editor.
  router.get('/tavole/:tavolaId/export.csv', bulkPasteController.spreadsheet);
  // Where a Part sits on this sheet, how many are fitted there, and whether the drawing shows it
  // — the three things a Listing has of its own. What the Part *is* is corrected below.
  router.patch('/listings/:listingId', partController.correctListing);
  router.delete('/listings/:listingId', partController.removeListing);

  // **The Part itself, addressed as the thing it is** (ADR 0001), which is why these hang off no
  // drawing: correcting a Part corrects it at every number it sits at, on every sheet, and
  // an address under one Tavola would suggest otherwise.
  //
  // The lookup is here rather than on a Tavola for the same reason, and it is what makes two
  // things reachable that ticket 06 left unreachable: listing a Part the archive already has at a
  // new number when it has no Catalog Number to collide with, and finding a Part that is listed
  // **nowhere** — which no screen reading from a drawing can see.
  //
  // It stands beside `/search` rather than under it because the two answer different questions
  // about the same matches. Search reports every number a Part sits at, so a member can go and
  // look at the right circle; this reports one row per *sheet*, because what an Editor about to
  // correct a Part is deciding on is how many drawings the correction reaches. The matching
  // itself is one rule in one place, which is what ticket 22 absorbing this meant.
  router.get('/parts', partController.lookUp);
  router.get('/parts/:partId', partController.read);
  router.patch('/parts/:partId', partController.correct);
  // Refused while anything still lists it. The Listings go first, so nothing here removes an
  // evening's work from a sheet the Editor is not looking at.
  router.delete('/parts/:partId', partController.remove);

  // **What fits the Part, what replaces it and where it has been available** — hung off the Part
  // and not off a Tavola, because all three are true of the component wherever it is listed
  // (ADR 0001). They are *read* with the Part at a Position and so have no address of their own;
  // what is here is only the writing.
  router.post('/parts/:partId/fitments', partRecordController.addFitment);
  router.patch('/fitments/:fitmentId', partRecordController.correctFitment);
  router.delete('/fitments/:fitmentId', partRecordController.removeFitment);

  router.post('/parts/:partId/equivalents', partRecordController.addEquivalent);
  router.patch('/equivalents/:equivalentId', partRecordController.correctEquivalent);
  router.delete('/equivalents/:equivalentId', partRecordController.removeEquivalent);

  router.post('/parts/:partId/sources', partRecordController.addSource);
  router.patch('/sources/:sourceId', partRecordController.correctSource);
  router.delete('/sources/:sourceId', partRecordController.removeSource);

  // **What the Part looks like**, hung off the Part for the same reason the three above are: the
  // same washer photographed once is the same washer on every sheet it is listed on (ADR 0001),
  // and a picture attached to a drawing would be the same picture uploaded six times.
  //
  // The photograph is the body, exactly as a scan is, and **nothing here trusts what it says it
  // is**: the parser claims every content type and ingest decides what the bytes actually are.
  // Reordering names the whole order rather than one photograph and a direction — an order is a
  // statement about the list, and half of one applied is an order nobody chose.
  router.post(
    '/parts/:partId/photographs',
    express.raw({ type: () => true, limit: dependencies.maxPhotographBytes }),
    photographController.upload,
  );
  router.patch('/parts/:partId/photographs', photographController.reorder);
  router.delete('/photographs/:photographId', photographController.remove);

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
  router.get('/photographs/:photographId/:variant', photographController.readImage);

  return router;
}
