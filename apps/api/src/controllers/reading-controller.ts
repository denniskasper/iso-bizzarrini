import type { ReadingSetup } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { CHARGED, type ConfiguredReading } from '../composition/reading.js';

export interface ReadingController {
  readMethod: RequestHandler;
}

/**
 * **The Readings section** (issue #55): what this server reads the catalog with, whether that is
 * charged, and whether reading can start. Built from the kind alone, so nothing a method holds —
 * its credential least of all — can reach the answer.
 */
export function createReadingController(dependencies: {
  reading: ConfiguredReading;
}): ReadingController {
  const { reading } = dependencies;

  const setup: ReadingSetup = {
    method: reading.kind,
    charged: reading.kind === null ? null : CHARGED[reading.kind],
    available: reading.method !== null,
    unavailable: reading.unavailable,
  };

  return {
    readMethod: (_request, response) => {
      response.json(setup);
    },
  };
}
