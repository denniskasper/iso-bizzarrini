/**
 * The systems of a car, as the Club lists them — what every archive starts with.
 *
 * **Names, not codes.** The original prototype numbered its categories, and the numbers encoded
 * which car a drawing belonged to; that half dissolved when Models became things of their own,
 * and what is left is the useful half: thirteen plain names.
 *
 * The migration that makes a Tavola's Category optional writes these into the archive, so this
 * list is not what puts them there. It is here for the one thing that empties the table again —
 * a practice system rewriting itself — and a test holds the two to the same thirteen. After
 * that the list is an Administrator's: they add to it and rename what is on it, without a
 * deployment.
 */
export const standingCategories = [
  'Drive Shafts',
  'Differential',
  'Wheels',
  'Front and Rear Suspension',
  'Anti-Roll Bar',
  'Steering',
  'Brakes',
  'Electrical',
  'Exhaust',
  'Cooling',
  'Fuel',
  'Body/Exterior',
  'Interior',
] as const;
