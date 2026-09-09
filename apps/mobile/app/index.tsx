import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppTitle, PrimaryButton, Screen } from '../src/components/ui';
import { colors } from '../src/theme';

export default function WelcomeScreen() {
  return <Screen scroll={false}><View style={styles.hero}>
    <View style={styles.mark}><Text style={styles.markText}>S</Text></View>
    <Text style={styles.brand}>SafePath AI</Text>
    <AppTitle eyebrow="Navigate with awareness" title="A clearer way to choose your route." subtitle="Compare routes with understandable safety evidence, and keep important help within reach." />
  </View>
  <View style={styles.footer}><PrimaryButton label="Get started" onPress={() => router.push('/signup')} /><PrimaryButton label="I already have an account" tone="outline" onPress={() => router.push('/login')} /><Text style={styles.disclaimer}>Safety information is guidance, not a guarantee of safety.</Text></View>
  </Screen>;
}

const styles = StyleSheet.create({ hero: { flex: 1, justifyContent: 'center', gap: 17 }, mark: { width: 65, height: 65, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary }, markText: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' }, brand: { color: colors.ink, fontSize: 17, fontWeight: '800' }, footer: { gap: 12 }, disclaimer: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 18 } });
