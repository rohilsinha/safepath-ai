import * as SecureStore from 'expo-secure-store';

const accessTokenKey = 'safepath_access_token';

export function saveAccessToken(accessToken: string): Promise<void> {
  return SecureStore.setItemAsync(accessTokenKey, accessToken);
}

export function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(accessTokenKey);
}

export function removeAccessToken(): Promise<void> {
  return SecureStore.deleteItemAsync(accessTokenKey);
}
