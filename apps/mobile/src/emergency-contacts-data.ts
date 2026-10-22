export type EmergencyContact = {
  id: string;
  name: string;
  relationship: string;
  phone: string;
};

export const emergencyContacts: EmergencyContact[] = [
  { id: '1', name: 'Asha Kumar', relationship: 'Sister', phone: '+91 98765 43210' },
  { id: '2', name: 'Meera Shah', relationship: 'Friend', phone: '+91 98765 12345' },
];
