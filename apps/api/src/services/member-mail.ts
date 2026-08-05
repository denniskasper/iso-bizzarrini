import type { OutboundEmail } from '../platform/email.js';

/**
 * The two letters this system sends a person about their own account.
 *
 * They are written here rather than made editable, and the Club's reminder text is editable
 * rather than written here — the difference is who owns the words. A renewal reminder is the
 * treasurer asking for money and belongs to the association (story 130); "here is your link"
 * belongs to the software that issued the link, and an editable version of it is a way for a
 * broken invitation to be nobody's fault.
 *
 * Plain text, deliberately. This is a link and a sentence explaining it, and a member reading it
 * in a mail client that shows no pictures should lose nothing at all.
 */
/** Everything a letter about somebody's own password needs: who, where, and for how long. */
export interface PasswordLink {
  to: string;
  name: string;
  link: string;
  expiresAt: Date;
}

export function invitationEmail(invitation: PasswordLink): OutboundEmail {
  return {
    to: invitation.to,
    subject: 'Your Ricambi invitation',
    text: [
      `Hello ${invitation.name},`,
      '',
      'The Club has added you to Ricambi, its parts reference for Iso and Bizzarrini cars.',
      'Follow this link to choose your own password:',
      '',
      invitation.link,
      '',
      `The link works once, and stops working on ${asDay(invitation.expiresAt)}.`,
      'If it has expired by the time you read this, ask the Club office to send another.',
      '',
      'Nobody at the Club can see the password you choose.',
    ].join('\n'),
  };
}

export function passwordResetEmail(reset: PasswordLink): OutboundEmail {
  return {
    to: reset.to,
    subject: 'Setting a new Ricambi password',
    text: [
      `Hello ${reset.name},`,
      '',
      'Somebody asked to set a new password for this address on Ricambi. Follow this link:',
      '',
      reset.link,
      '',
      `The link works once, and stops working at ${asInstant(reset.expiresAt)}.`,
      '',
      'If that was not you, nothing has changed and you can ignore this message —',
      'your current password still works.',
    ].join('\n'),
  };
}

/** `3 September 2026`. Read by a person, so not the ISO form the archive stores. */
function asDay(instant: Date): string {
  return instant.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The same, with the hour — a two-hour link needs one. UTC is named rather than assumed. */
function asInstant(instant: Date): string {
  return `${instant.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })} UTC on ${asDay(instant)}`;
}
