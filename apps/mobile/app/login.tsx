import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { AppTitle, BackButton, Field, PrimaryButton, Screen } from '../src/components/ui';
import { ApiError, login } from '../src/api';
import { saveAccessToken } from '../src/session';
import { useUser } from '../src/user-context';

export default function LoginScreen() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setUser } = useUser();

  const handleLogin = async (): Promise<void> => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const response = await login({ email, password });
      await saveAccessToken(response.accessToken);
      setUser(response.user);
      router.replace('/home');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        Alert.alert('Sign in failed', 'Invalid email or password');
      } else if (error instanceof Error) {
        Alert.alert('Sign in failed', error.message);
      } else {
        Alert.alert('Sign in failed', 'Unable to sign in. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return <Screen><BackButton onPress={() => router.back()} /><AppTitle eyebrow="Welcome back" title="Sign in to SafePath" subtitle="Your account features will connect here when authentication is added." />
    <View style={{ gap: 16 }}><Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} /><Field label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry /><PrimaryButton label={isSubmitting ? 'Signing in...' : 'Sign in'} onPress={handleLogin} disabled={isSubmitting} /><Text style={{ textAlign: 'center', color: '#607079' }}>New to SafePath? <Text style={{ color: '#007A68', fontWeight: '800' }} onPress={() => router.replace('/signup')}>Create an account</Text></Text></View>
  </Screen>;
}
