/**
 * The Units and Specification names every archive starts with, so nobody has to build the lists
 * before anything can be recorded.
 *
 * The migration that makes the two lists writes these into the archive, so this file is not what
 * puts them there; a test holds the two to the same entries. After that both lists are an
 * Administrator's: they add to them, rename, reorder and remove, without a deployment. The
 * Club's own names will come from its sample data and are added that way.
 */
export const standingUnits = [
  'g',
  'kg',
  'mm',
  'cm',
  'm',
  'Nm',
  'kgm',
  'bar',
  'V',
  'A',
  'W',
  'Ω',
  'l',
  'ml',
  '°',
  '°C',
] as const;

/** In the order a Part's Specifications read in, each with the Unit it is counted in. */
export const standingSpecificationNames: readonly {
  name: string;
  unit: (typeof standingUnits)[number] | null;
}[] = [
  { name: 'Material', unit: null },
  { name: 'Colour/finish', unit: null },
  { name: 'Length', unit: 'mm' },
  { name: 'Width', unit: 'mm' },
  { name: 'Height', unit: 'mm' },
  { name: 'Diameter', unit: 'mm' },
  { name: 'Thread', unit: null },
  { name: 'Weight', unit: 'g' },
];
