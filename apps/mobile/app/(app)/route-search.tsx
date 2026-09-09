import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { AppTitle, BackButton, Card, PrimaryButton, Screen } from '../../src/components/ui';
import { colors } from '../../src/theme';

export default function RouteSearchScreen() { const [destination, setDestination] = useState('T. Nagar'); return <Screen><BackButton onPress={() => router.back()} /><AppTitle eyebrow="Route search" title="Choose a destination" subtitle="Route options below are local mock data until maps are connected." />
  <View style={{ gap: 14 }}><Card><Text style={styles.smallLabel}>FROM</Text><Text style={styles.place}>Chennai Central</Text></Card><View style={{ gap: 8 }}><Text style={styles.label}>To</Text><TextInput accessibilityLabel="Destination" value={destination} onChangeText={setDestination} style={styles.input} /></View><PrimaryButton label="See route options" onPress={() => router.push({ pathname: '/route-results', params: { destination } })} /></View>
  <Text style={styles.note}>No location is collected or shared in this preview.</Text></Screen>; }
const styles = StyleSheet.create({ smallLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 }, place: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 8 }, label: { color: colors.ink, fontWeight: '700' }, input: { minHeight: 54, borderRadius: 14, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, padding: 15, fontSize: 16, color: colors.ink }, note: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 } });
