import express, { Router, type RequestHandler } from 'express';
import type { Gate } from '../access/gate.js';
import type { UncheckedTavolaGuard } from '../access/unchecked-tavole.js';
import type { BulkPasteController } from '../controllers/bulk-paste-controller.js';
import type { CatalogController } from '../controllers/catalog-controller.js';
import type { CatalogRunController } from '../controllers/catalog-run-controller.js';
import type { CheckingController } from '../controllers/checking-controller.js';
import type { CategoryController } from '../controllers/category-controller.js';
import type { ClubController } from '../controllers/club-controller.js';
import type { LegalController } from '../controllers/legal-controller.js';
import type { ContributionController } from '../controllers/contribution-controller.js';
import type { ContributionReviewController } from '../controllers/contribution-review-controller.js';
import type { ReadingController } from '../controllers/reading-controller.js';
import type { ReminderController } from '../controllers/reminder-controller.js';
import type { RetentionController } from '../controllers/retention-controller.js';
import type { RosterController } from '../controllers/roster-controller.js';
import type { RosterImportController } from '../controllers/roster-import-controller.js';
import type { PartController } from '../controllers/part-controller.js';
import type { PartRecordController } from '../controllers/part-record-controller.js';
import type { PhotographController } from '../controllers/photograph-controller.js';
import type { ScanController } from '../controllers/scan-controller.js';
import type { SearchController } from '../controllers/search-controller.js';
import type { PositionController } from '../controllers/position-controller.js';
import type { SessionController } from '../controllers/session-controller.js';
import type { StatusController } from '../controllers/status-controller.js';
import type { SubAssemblyController } from '../controllers/sub-assembly-controller.js';
import type { SubscriptionController } from '../controllers/subscription-controller.js';
import type { TavolaController } from '../controllers/tavola-controller.js';

/** Where this router is mounted. Named once, so nothing has to agree with it by memory. */
export const API_MOUNT = '/api';

/** Under `API_MOUNT`. Named, because the application keeps this one address's body unparsed. */
export const WEBHOOK_PATH = '/payments/webhook';

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
  uncheckedTavolaGuard: UncheckedTavolaGuard;
  maxScanBytes: number;
  maxPhotographBytes: number;
  statusController: StatusController;
  sessionController: SessionController;
  rosterController: RosterController;
  subscriptionController: SubscriptionController;
  reminderController: ReminderController;
  readingController: ReadingController;
  catalogRunController: CatalogRunController;
  retentionController: RetentionController;
  rosterImportController: RosterImportController;
  clubController: ClubController;
  legalController: LegalController;
  searchController: SearchController;
  catalogController: CatalogController;
  categoryController: CategoryController;
  tavolaController: TavolaController;
  checkingController: CheckingController;
  positionController: PositionController;
  subAssemblyController: SubAssemblyController;
  partController: PartController;
  partRecordController: PartRecordController;
  bulkPasteController: BulkPasteController;
  photographController: PhotographController;
  contributionController: ContributionController;
  contributionReviewController: ContributionReviewController;
  scanController: ScanController;
}): Router {
  const {
    gate,
    uncheckedTavolaGuard,
    statusController,
    sessionController,
    rosterController,
    subscriptionController,
    reminderController,
    readingController,
    catalogRunController,
    retentionController,
    rosterImportController,
    clubController,
    legalController,
    searchController,
    catalogController,
    categoryController,
    tavolaController,
    checkingController,
    positionController,
    subAssemblyController,
    partController,
    partRecordController,
    bulkPasteController,
    photographController,
    contributionController,
    contributionReviewController,
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

  // **The platform's own legal pages** (issue #9): who is behind it, and what it keeps about a
  // person, for how long (ADR 0007) and in whose hands. Open, because neither is addressed to
  // members — a legal notice is for whoever lands here, and a privacy statement nobody can read
  // until they have handed over their address is not one. Neither says anything about anybody.
  router.get('/legal-notice', legalController.readLegalNotice);
  router.get('/privacy', legalController.readPrivacy);

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
  // Deleting one person's personal data on request (story 131, ADR 0007). What they published
  // stays; what the Club was paid stays; the person does not.
  router.delete('/roster/:accountId', administratorsOnly, retentionController.erase);
  // The dry run: who the next retention sweep would delete, while they can still be asked.
  router.get('/roster/retention', administratorsOnly, retentionController.report);

  // **The Club's annual membership list, loaded instead of typed** (ticket 16). Above
  // `/roster/:accountId` in the file and below it on the wire either way — `import` is not a uuid,
  // so the two never compete for a request.
  //
  // The preview has an address of its own rather than a flag on the write, exactly as bulk paste
  // does: nothing about this may be one wrong boolean away from writing a hundred rows.
  router.post('/roster/import/preview', administratorsOnly, rosterImportController.preview);
  router.post('/roster/import', administratorsOnly, rosterImportController.apply);

  // **Renewal reminders** (issue #3): who would be written to, read before anything is switched
  // on, and the job run by hand. An Administrator's, like the roster both of them read.
  router.get('/reminders', administratorsOnly, reminderController.plan);
  router.post('/reminders/run', administratorsOnly, reminderController.run);

  // **The Readings section** (issue #55): what this server reads the catalog with. Behind the
  // role like the roster, and not there at all for anybody else: how the catalog is read, and
  // what it costs, is not something a Member is told exists.
  router.get('/reading-method', gate.hiddenFromAllButAdministrators, readingController.readMethod);
  // **A Catalog run** (issue #57): the catalog uploaded and priced, before anything is read. The
  // role is checked before the body is read, so nobody else can even send a catalog here. The
  // catalog is as private as a Scan, and served to nobody but an Administrator.
  // Every run, the latest first, each opening its record of what it cost (issue #62).
  router.get('/catalog-runs', gate.hiddenFromAllButAdministrators, catalogRunController.list);
  // No body parser: a catalog runs to hundreds of megabytes, and goes to the file store as it
  // arrives (issue #65). Its size is held to the limit as it is read.
  router.post('/catalog-runs', gate.hiddenFromAllButAdministrators, catalogRunController.estimate);
  // **One Unchecked Tavola read again** (issue #61), from the catalog the run that read it kept:
  // the run it would be read from, and a new run estimated, to start as any other. The Tavola is
  // named in the query and the body rather than the path, because a Tavola in the path is guarded
  // as the archive is, below; these are as hidden as every other Catalog run address. Above
  // `/catalog-runs/:runId`, which would otherwise take `read-again` for a run.
  router.get(
    '/catalog-runs/read-again',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.readAgainFrom,
  );
  router.post(
    '/catalog-runs/read-again',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.readAgain,
  );
  // **Removing an Unchecked Tavola** (issue #83), a run's mistake taken out whole: as hidden as
  // Read again, and up here with it, above the Membership a lapsed Administrator lacks and the
  // Editors' rule for writes. Its Tavola is `:removing`, not `:tavolaId`: the Unchecked guard
  // below asks who is signed in, which nothing here has found yet, and an Administrator is shown
  // every Tavola anyway.
  router.delete(
    '/tavole/:removing',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.removeTavola,
  );
  // What removing it would take, asked before the removal is confirmed (issue #84).
  router.get(
    '/tavole/:removing/removal',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.tavolaRemoval,
  );

  router.get(
    '/catalog-runs/:runId',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.read,
  );
  // Started with a spending limit, and read in the background (issue #58). Only an Administrator
  // spends the Club's money.
  router.post(
    '/catalog-runs/:runId/start',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.start,
  );
  // Stopped, and continued from where it stopped, with its limit raised first where that is
  // what stopped it (issue #59).
  router.post(
    '/catalog-runs/:runId/continue',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.carryOn,
  );
  router.post(
    '/catalog-runs/:runId/stop',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.stop,
  );
  router.get(
    '/catalog-runs/:runId/catalog',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.readCatalog,
  );
  // The pages a run set aside, to look at (issue #60). As private as the catalog they came from.
  router.get(
    '/catalog-runs/:runId/set-aside/:page',
    gate.hiddenFromAllButAdministrators,
    catalogRunController.readSetAsidePage,
  );

  router.get('/club', administratorsOnly, clubController.read);
  router.patch('/club', administratorsOnly, clubController.correct);

  // **Who handles members' data on the association's behalf**, and whether the agreement with
  // each is signed (issue #9). The names are published in the privacy statement above; this is
  // the association's own record of them, which says more than the public is owed.
  router.get('/processors', administratorsOnly, legalController.listProcessors);
  router.put('/processors/:role', administratorsOnly, legalController.nameProcessor);
  router.delete('/processors/:role', administratorsOnly, legalController.removeProcessor);

  // **Keeping the list of Categories** (issue #8) — an Administrator's, like the roster, and up
  // here with it for the same reason: it is behind the *role*. The rule further down makes every
  // write in the archive an Editor's, and this is the one list an Editor chooses from and does
  // not add to. Reading the list is the archive's, and is below with everything else.
  router.post('/categories', administratorsOnly, categoryController.add);
  router.patch('/categories/:categoryId', administratorsOnly, categoryController.rename);

  // **What a lapsed member is shown instead of the archive** (ticket 15). Behind the gate,
  // because it carries the Club's bank details; deliberately *not* behind a live Membership,
  // because the person who needs it is precisely the person whose Membership has run out.
  //
  // A separate address rather than widening `/club`: what a member needs in order to pay is the
  // amount, where to send it, what to write on it and who to ask, and it arrives with the
  // reference already written in their name. The Club's record itself — the reminder text, the
  // format that reference came out of — stays an Administrator's.
  router.get('/renewal', gate.requireSignedIn, clubController.readRenewal);

  // **Where the payment provider delivers**, and the only thing in the archive that can move a
  // Paid-through without an Administrator. Nobody is signed in at it: what it is behind is the
  // provider's signature over the exact bytes it sent, checked before anything is believed.
  router.post(WEBHOOK_PATH, subscriptionController.receiveWebhook);

  // **A member's own subscription** (ADR 0004, issue #4). Signed in is enough for all four, for
  // the reason the renewal is: the member who needs to pay is the one the archive is refusing.
  // None of them moves a Paid-through — only the provider's own confirmation does that.
  router.get('/subscription', gate.requireSignedIn, subscriptionController.read);
  router.post('/subscription', gate.requireSignedIn, subscriptionController.start);
  router.put(
    '/subscription/auto-renewal',
    gate.requireSignedIn,
    subscriptionController.setAutoRenewal,
  );
  router.get(
    '/subscription/payments/:paymentId/receipt',
    gate.requireSignedIn,
    subscriptionController.readReceipt,
  );

  // Everything below is the archive, and the archive is what a live Membership buys.
  router.use(gate.requireLiveMembership);

  // **An Unchecked Tavola is an Editor's until one publishes it** (ADR 0017): every address that
  // names a Tavola, a number on one or its scan answers a Member as if it were not there.
  router.param('tavolaId', uncheckedTavolaGuard.tavolaId);
  router.param('positionId', uncheckedTavolaGuard.positionId);
  router.param('scanId', uncheckedTavolaGuard.scanId);

  /**
   * **What a member offers** (issue #5) — above the rule below, and the only writes that are.
   *
   * A Contribution is not a change to the archive: it is something said *to* it, which nobody
   * else is shown until an Editor has looked. So a live Membership is what it takes to send one,
   * exactly as it is what it takes to read, and the Editor's hand the rule below insists on is
   * still the only one that touches the record.
   */
  router.post('/parts/:partId/contributions', contributionController.writeAboutPart);
  router.post('/positions/:positionId/contributions', contributionController.writeAboutPosition);
  // A photograph with one, sent on its own once the words have arrived. The body is the
  // picture, exactly as it is for a Part's, and nothing here trusts what it says it is.
  router.post(
    '/contributions/:contributionId/photographs',
    express.raw({ type: () => true, limit: dependencies.maxPhotographBytes }),
    contributionController.attachPhotograph,
  );

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

  // **The systems of a car, and one of them across every car** (issue #8). Named by slug and
  // not by id: `/categories/brakes` is an address a member can read, and say down a telephone.
  router.get('/categories', categoryController.list);
  router.get('/categories/:slug', categoryController.read);

  router.get('/tavole/:tavolaId', tavolaController.read);
  router.post('/models/:modelId/tavole', tavolaController.create);
  // Filing a sheet under a system, moving it, or taking it out — the one thing about a Tavola
  // that changes after it is recorded, because the list it is chosen from changes too.
  router.put('/tavole/:tavolaId/category', tavolaController.categorise);
  // **Publishing is one act and an Editor's** (issue #30). It has an address of its own rather
  // than a field on the Tavola, because it is a statement somebody makes and is recorded as one.
  router.post('/tavole/:tavolaId/publication', tavolaController.publish);
  // **Vouching for an English name is a judgement of its own** (issue #32): confirmed as it
  // stands or rewritten, it is no longer a Machine translation. Publishing never does this.
  router.put('/tavole/:tavolaId/english-name', tavolaController.nameInEnglish);

  // **Checking what the machine read** (issue #34): the rows beside the sheets they came from,
  // the doubts and the Reading method. An Editor's out loud, because the Reading method is never
  // told to a Member. The sheets themselves are the archive's, as private as the drawing, and a
  // Member reaches them once the Tavola is Published — the guard above sees to the rest.
  router.get('/tavole/:tavolaId/checking', editorsOnly, checkingController.read);
  router.get('/tavole/:tavolaId/table-sheets/:sheet', checkingController.readTableSheet);
  // **A doubt an Editor has looked at** (issue #56): rewritten in their words, or cleared, so the
  // band shows only what still needs looking at. Writes, so the guard above keeps them an
  // Editor's; and only while the Tavola is Unchecked.
  router.put('/doubts/:doubtId', checkingController.rewriteDoubt);
  router.delete('/doubts/:doubtId', checkingController.clearDoubt);

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
  // **A Sub-assembly read as one thing** (issue #110), under its Tavola: that is the only place
  // it exists, and it puts the page behind whatever its Tavola is behind. Its Note is an Editor's
  // to write, by the rule above.
  router.get('/tavole/:tavolaId/sub-assemblies/:subAssemblyId', subAssemblyController.read);
  router.put('/sub-assemblies/:subAssemblyId/note', subAssemblyController.writeNote);

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
  // **What members have said about the number and the Parts at it**, read beside the Listings
  // and one request like them. The answer depends on who asks: a Contribution still waiting to
  // be checked is returned to the member who wrote it and to nobody else.
  router.get('/positions/:positionId/contributions', contributionController.readAtPosition);

  /**
   * **What an Editor does with what members sent** (issue #6): read what is waiting, decide it,
   * and carry a member's gap or a member's picture across into the record.
   *
   * The two reads say `editorsOnly` out loud, and they are the only `GET`s in the archive that
   * do. The rule above lets every member read, because everything else under it reads the same
   * for all of them — and this is the one thing in the archive members were promised nobody
   * would be shown unchecked. The three writes are an Editor's by that rule already.
   *
   * Correcting the Part while reviewing has no address here on purpose. It is `PATCH
   * /parts/:partId` and its neighbours below, the tools the archive already has: there is no
   * diff to apply, and the Editor's hand is the audit trail.
   */
  router.get('/contributions/waiting', editorsOnly, contributionReviewController.listWaiting);
  router.get(
    '/contributions/waiting/count',
    editorsOnly,
    contributionReviewController.countWaiting,
  );
  router.put('/contributions/:contributionId/decision', contributionReviewController.decide);
  // A Part and Listing at the empty number a Contribution is about, which is then that Part's.
  router.post('/contributions/:contributionId/part', contributionReviewController.recordPart);
  // Moved, not copied: the picture is the Part's from then on, at the address a Part's are at.
  router.post(
    '/contribution-photographs/:photographId/promotion',
    contributionReviewController.promotePhotograph,
  );

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
  router.put('/parts/:partId/english-name', partController.nameInEnglish);
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
  // A sheet scanned on its side, turned upright a quarter at a time with its Marks (issue #34).
  router.post('/tavole/:tavolaId/scan/turns', scanController.turn);

  router.get('/scans/:scanId/:variant', scanController.readImage);
  router.get('/photographs/:photographId/:variant', photographController.readImage);
  // A member's own picture, until an Editor has looked: served to its author and to the Editor
  // checking it, and to the rest of the Club once the Contribution it came with is published.
  router.get('/contribution-photographs/:photographId/:variant', contributionController.readImage);

  return router;
}
