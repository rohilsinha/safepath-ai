import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { AppTitle, BackButton, Field, PrimaryButton, Screen } from '../src/components/ui';

export default function SignupScreen() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  return <Screen><BackButton onPress={() => router.back()} /><AppTitle eyebrow="Create your space" title="Set up your SafePath profile" subtitle="This screen is a local UI preview. No account is created yet." />
    <View style={{ gap: 16 }}><Field label="Your name" placeholder="Enter your name" value={name} onChangeText={setName} /><Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} /><Field label="Password" placeholder="Create a password" value={password} onChangeText={setPassword} secureTextEntry /><PrimaryButton label="Create account" onPress={() => router.replace('/home')} /></View>
  </Screen>;
}
