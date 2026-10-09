import type { MembershipStandingResponse, StartSubscriptionResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { Gate } from '../access/gate.js';
import { ValidationError } from '../http/errors.js';
import { WebhookVerificationError, type PaymentProvider } from '../platform/payments.js';
import type { SubscriptionService } from '../services/subscription-service.js';

const renewalBody = z.object({ renews: z.boolean() });

const paymentParams = z.object({ paymentId: z.uuid('That is not one of your payments.') });

/** A request whose body was kept as bytes beside what it parsed to. See `app.ts`. */
export interface RawBodied {
  rawBody?: Buffer;
}

/**
 * A member's own subscription, and the address the payment provider delivers to.
 *
 * **Whose subscription it is always comes from the session.** None of the member-facing handlers
 * takes an Account from the request, so there is no way to ask about, start or cancel anybody
 * else's.
 */
export interface SubscriptionController {
  read: RequestHandler;
  start: RequestHandler;
  setAutoRenewal: RequestHandler;
  readReceipt: RequestHandler;
  receiveWebhook: RequestHandler;
}

export function createSubscriptionController(dependencies: {
  gate: Gate;
  paymentProvider: PaymentProvider;
  subscriptionService: SubscriptionService;
}): SubscriptionController {
  const { gate, paymentProvider, subscriptionService } = dependencies;

  return {
    read: async (_request, response) => {
      const body: MembershipStandingResponse = {
        membership: await subscriptionService.standingOf(gate.whoIsSignedIn(response)),
      };
      response.json(body);
    },

    start: async (_request, response) => {
      const body: StartSubscriptionResponse = await subscriptionService.start(
        gate.whoIsSignedIn(response),
      );
      response.status(201).json(body);
    },

    setAutoRenewal: async (request, response) => {
      const { renews } = renewalBody.parse(request.body);
      const body: MembershipStandingResponse = {
        membership: await subscriptionService.setAutoRenewal(gate.whoIsSignedIn(response), renews),
      };
      response.json(body);
    },

    /**
     * Sends the member on to the provider's own receipt, **asked for now**: the provider's
     * links stop working after a while, so none is kept and a fresh one is fetched each time.
     */
    readReceipt: async (request, response) => {
      const { paymentId } = paymentParams.parse(request.params);
      response.redirect(
        303,
        await subscriptionService.receiptUrlFor(gate.whoIsSignedIn(response), paymentId),
      );
    },

    /**
     * **The one address in the archive that nobody is signed in at**, and that changes what a
     * member may read. What stands in for a session is the provider's signature over the exact
     * bytes it sent — which is why the bytes are read here and the parsed body is not.
     *
     * A delivery that does not verify is answered 400 and has changed nothing. One that does is
     * answered 200 whether or not it was news, because a provider that is told "no" delivers
     * again, and a redelivery is not an error.
     */
    receiveWebhook: async (request, response) => {
      const signature = request.headers[paymentProvider.signatureHeader];

      try {
        await subscriptionService.receive({
          rawBody: (request as RawBodied).rawBody?.toString('utf8') ?? '',
          signature: typeof signature === 'string' ? signature : undefined,
        });
      } catch (error) {
        if (error instanceof WebhookVerificationError) {
          throw new ValidationError('That delivery could not be verified.');
        }
        throw error;
      }

      response.json({ received: true });
    },
  };
}
