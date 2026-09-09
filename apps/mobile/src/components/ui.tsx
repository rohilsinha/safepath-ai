import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, shadow } from '../theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const content = <View style={styles.content}>{children}</View>;
  return <SafeAreaView style={styles.safe} edges={['top']}>
    {scroll ? <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>{content}</ScrollView> : content}
  </SafeAreaView>;
}

export function AppTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return <View style={styles.titleBlock}>
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
    <Text style={styles.title}>{title}</Text>
    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
  </View>;
}

export function PrimaryButton({ label, onPress, tone = 'primary', disabled = false }: { label: string; onPress: () => void; tone?: 'primary' | 'outline' | 'danger'; disabled?: boolean }) {
  const buttonStyle: ViewStyle[] = [styles.button, tone === 'primary' && styles.primaryButton, tone === 'outline' && styles.outlineButton, tone === 'danger' && styles.dangerButton, disabled && styles.disabled];
  const textStyle = tone === 'outline' ? styles.outlineButtonText : styles.buttonText;
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [...buttonStyle, pressed && styles.pressed]}>
    <Text style={textStyle}>{label}</Text>
  </Pressable>;
}

export function Field({ label, placeholder, value, onChangeText, secureTextEntry = false }: { label: string; placeholder: string; value: string; onChangeText: (value: string) => void; secureTextEntry?: boolean }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} autoCapitalize="none" placeholder={placeholder} placeholderTextColor="#7C8B91" secureTextEntry={secureTextEntry} style={styles.input} value={value} onChangeText={onChangeText} />
  </View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onPress} style={styles.back}><Text style={styles.backText}>‹</Text></Pressable>;
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return <View style={styles.sectionTitle}><Text style={styles.sectionText}>{title}</Text>{action}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flexGrow: 1 },
  content: { flex: 1, padding: 20, gap: 20 },
  titleBlock: { gap: 7 },
  eyebrow: { color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.ink, fontSize: 31, lineHeight: 38, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  button: { minHeight: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 },
  primaryButton: { backgroundColor: colors.primary },
  outlineButton: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: colors.surface },
  dangerButton: { backgroundColor: colors.danger },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  outlineButtonText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  field: { gap: 8 }, label: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  input: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, color: colors.ink, borderRadius: 14, minHeight: 52, paddingHorizontal: 15, fontSize: 16 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 17, borderWidth: 1, borderColor: '#E9F0ED', ...shadow },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }, backText: { color: colors.ink, fontSize: 34, lineHeight: 38, marginTop: -4 },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, sectionText: { color: colors.ink, fontSize: 19, fontWeight: '800' },
});
