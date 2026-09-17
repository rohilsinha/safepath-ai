import { useState } from 'react';
import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import { AppTitle, BackButton, Field, PrimaryButton, Screen } from '../src/components/ui';
import { ApiError, signup } from '../src/api';
import { useUser } from '../src/user-context';

export default function SignupScreen() {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setUser } = useUser();

  const handleSignup = async (): Promise<void> => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const user = await signup({ name, email, password });
      setUser(user);
      router.replace('/home');
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        Alert.alert('Sign up failed', 'An account with this email already exists');
      } else if (error instanceof Error) {
        Alert.alert('Sign up failed', error.message);
      } else {
        Alert.alert('Sign up failed', 'Unable to create your account. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return <Screen><BackButton onPress={() => router.back()} /><AppTitle eyebrow="Create your space" title="Set up your SafePath profile" subtitle="Create your account to get started." />
    <View style={{ gap: 16 }}><Field label="Your name" placeholder="Enter your name" value={name} onChangeText={setName} /><Field label="Email address" placeholder="you@example.com" value={email} onChangeText={setEmail} /><Field label="Password" placeholder="Create a password" value={password} onChangeText={setPassword} secureTextEntry /><PrimaryButton label={isSubmitting ? 'Creating account...' : 'Create account'} onPress={handleSignup} disabled={isSubmitting} /></View>
  </Screen>;
}
