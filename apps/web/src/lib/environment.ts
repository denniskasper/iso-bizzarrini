import type { EnvironmentMode } from '@ricambi/contracts';

/**
 * Whether this is the real archive.
 *
 * Read off the document rather than fetched, exactly as the theme is: the answer is stamped on
 * the `<html>` element by whatever served the page, before a request has been made or a pixel
 * painted. A member deciding whether to trust what they are reading should not have to wait for
 * `/api/status` to come back — and a practice system whose database is unreachable must still
 * say what it is.
 *
 * Anything other than an explicit `production` is treated as practice. That direction is the
 * whole point: a production system wearing a demo banner is embarrassing and instantly visible;
 * a demo passing itself off as the archive is the failure worth engineering against.
 */
export function environmentMode(): EnvironmentMode {
  return document.documentElement.dataset.environmentMode === 'production'
    ? 'production'
    : 'non-production';
}
