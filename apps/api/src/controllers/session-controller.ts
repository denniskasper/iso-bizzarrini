import type { SessionResponse } from '@ricambi/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import type { EditorGate } from '../access/editor-gate.js';
import { NotSignedInError } from '../http/errors.js';

const signInBody = z.object({
  passphrase: z.string().min(1, 'A passphrase is required'),
});

export interface SessionController {
  read: RequestHandler;
  signIn: RequestHandler;
  signOut: RequestHandler;
}

export function createSessionController(dependencies: {
  editorGate: EditorGate;
}): SessionController {
  const { editorGate } = dependencies;

  return {
    read: (request, response) => {
      const body: SessionResponse = { signedIn: editorGate.isSignedIn(request.headers.cookie) };
      response.json(body);
    },

    signIn: (request, response) => {
      const { passphrase } = signInBody.parse(request.body);

      // One message for a wrong passphrase and for a gate nobody configured. The second is a
      // deployment mistake rather than a secret, but telling the difference apart out loud is
      // how a stranger learns which of the two systems in front of them is worth guessing at.
      if (!editorGate.admits(passphrase)) {
        throw new NotSignedInError('That passphrase was not recognised.');
      }

      editorGate.signIn(response);
      const body: SessionResponse = { signedIn: true };
      response.status(201).json(body);
    },

    signOut: (_request, response) => {
      editorGate.signOut(response);
      const body: SessionResponse = { signedIn: false };
      response.json(body);
    },
  };
}
