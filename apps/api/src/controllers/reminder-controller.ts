import type { ReminderPlan, ReminderRun } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import type { ReminderService } from '../services/reminder-service.js';

/**
 * Renewal reminders, as an Administrator meets them (issue #3): the preview of who would be
 * written to, and the button that runs the job now instead of tonight.
 *
 * Switching reminders on is not here. It is a fact about the Club, kept on the Club's record
 * with the letter's wording and the treasurer's address, and changed the way they are.
 */
export interface ReminderController {
  plan: RequestHandler;
  run: RequestHandler;
}

export function createReminderController(dependencies: {
  reminderService: ReminderService;
}): ReminderController {
  const { reminderService } = dependencies;

  return {
    plan: async (_request, response) => {
      const body: ReminderPlan = await reminderService.plan();
      response.json(body);
    },

    run: async (_request, response) => {
      const body: ReminderRun = await reminderService.runByHand();
      response.json(body);
    },
  };
}
