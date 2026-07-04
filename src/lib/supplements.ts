/** Hardcoded daily supplement protocol (Apple Health can't export meds/supps). */
export interface Supplement { key: string; name: string; dose: string }
export interface SupplementSlot { key: string; time: string; label: string; accent: string; items: Supplement[] }

export const SUPPLEMENT_PROTOCOL: SupplementSlot[] = [
  { key: 'morning', time: '10:30', label: 'Morning', accent: '#43F59B', items: [
    { key: 'multivitamin', name: 'Two Per Day Multivitamin', dose: '1 tab' },
    { key: 'd3k2', name: 'Vitamin D3 + K2', dose: '1 cap' },
  ] },
  { key: 'pre', time: '11:45', label: 'Pre-Workout', accent: '#38E1FF', items: [
    { key: 'citrulline', name: 'L-Citrulline Malate 2:1', dose: '6 g' },
  ] },
  { key: 'post', time: '15:00', label: 'Post-Workout', accent: '#4FC3FF', items: [
    { key: 'creatine', name: 'Creatine Monohydrate', dose: '5 g' },
    { key: 'omega3', name: 'Omega-3 Fish Oil', dose: '1 cap' },
  ] },
  { key: 'night', time: '22:00', label: 'Night', accent: '#7C8CFF', items: [
    { key: 'magnesium', name: 'Magnesium Glycinate', dose: '100 mg' },
    { key: 'glycine', name: 'Glycine', dose: '3 g' },
    { key: 'theanine', name: 'L-Theanine', dose: '200 mg' },
  ] },
]

export const ALL_SUPPLEMENT_KEYS = SUPPLEMENT_PROTOCOL.flatMap((s) => s.items.map((i) => i.key))
export const TOTAL_SUPPLEMENTS = ALL_SUPPLEMENT_KEYS.length
