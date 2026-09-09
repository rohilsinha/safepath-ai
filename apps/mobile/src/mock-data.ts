export type EmergencyContact = { id: string; name: string; relationship: string; phone: string };
export type RouteOption = { id: string; title: string; duration: string; distance: string; score: number; summary: string; tag: 'Recommended' | 'Fastest' | 'Alternative' };

export const emergencyContacts: EmergencyContact[] = [
  { id: '1', name: 'Asha Kumar', relationship: 'Sister', phone: '+91 98765 43210' },
  { id: '2', name: 'Meera Shah', relationship: 'Friend', phone: '+91 98765 12345' },
];

export const routeOptions: RouteOption[] = [
  { id: '1', title: 'Well-lit main roads', duration: '22 min', distance: '7.4 km', score: 84, summary: 'Higher lighting coverage and fewer recent reports.', tag: 'Recommended' },
  { id: '2', title: 'Fastest route', duration: '17 min', distance: '6.3 km', score: 68, summary: 'Shorter travel time with mixed community feedback.', tag: 'Fastest' },
  { id: '3', title: 'Neighbourhood connector', duration: '25 min', distance: '7.8 km', score: 74, summary: 'Calmer route with lower lighting coverage in one section.', tag: 'Alternative' },
];
