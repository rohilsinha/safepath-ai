import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { UserProvider } from '../src/user-context';
import { useUser } from '../src/user-context';

export default function RootLayout() {
  return <UserProvider><StatusBar style="dark" /><SessionGate /></UserProvider>;
}

function SessionGate() {
  const { status } = useUser();
  const segments = useSegments();

  if (status === 'loading') {
    return <View style={{ flex: 1, backgroundColor: '#F7FAF8' }} />;
  }

  const isAuthenticatedRoute = segments[0] === '(app)';
  if (status === 'authenticated' && !isAuthenticatedRoute) {
    return <Redirect href="/home" />;
  }

  if (status === 'unauthenticated' && isAuthenticatedRoute) {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
