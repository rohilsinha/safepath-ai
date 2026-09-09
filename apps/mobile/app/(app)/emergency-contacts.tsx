import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppTitle, BackButton, Card, PrimaryButton, Screen } from '../../src/components/ui';
import { emergencyContacts } from '../../src/mock-data';
import { colors } from '../../src/theme';

export default function EmergencyContactsScreen() { return <Screen><BackButton onPress={() => router.back()} /><AppTitle eyebrow="Trusted people" title="Emergency contacts" subtitle="These sample contacts are not saved or notified yet." />
  <View style={{ gap: 11 }}>{emergencyContacts.map((contact) => <Card key={contact.id} style={styles.contact}><View style={styles.avatar}><Text style={styles.avatarText}>{contact.name.split(' ').map((part) => part[0]).join('')}</Text></View><View style={{ flex: 1 }}><Text style={styles.name}>{contact.name}</Text><Text style={styles.relationship}>{contact.relationship} · {contact.phone}</Text></View></Card>)}</View><PrimaryButton label="Add emergency contact" tone="outline" onPress={() => undefined} /></Screen>; }
const styles = StyleSheet.create({ contact: { flexDirection: 'row', alignItems: 'center', gap: 13 }, avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.primaryDark, fontWeight: '900' }, name: { color: colors.ink, fontSize: 16, fontWeight: '800' }, relationship: { color: colors.muted, fontSize: 13, marginTop: 4 } });
