import { useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { AppTitle, BackButton, Field, PrimaryButton, Screen } from '../src/components/ui';

export default function LoginScreen() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  return <Screen><BackButton onPress={() => router.back()} /><AppTitle eyebrow="Welcome back" title="Sign in to SafePath" subtitle="Your account features will connect here when authentication is added." />
    <View style={{ gap: 16 }}><Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} /><Field label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry /><PrimaryButton label="Sign in" onPress={() => router.replace('/home')} /><Text style={{ textAlign: 'center', color: '#607079' }}>New to SafePath? <Text style={{ color: '#007A68', fontWeight: '800' }} onPress={() => router.replace('/signup')}>Create an account</Text></Text></View>
  </Screen>;
}
