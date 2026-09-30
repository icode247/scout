import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/auth';

export default function Index() {
  const { isAuthenticated, isReady } = useAuth();
  if (!isReady) return null;
  return <Redirect href={isAuthenticated ? '/(tabs)' : '/sign-in'} />;
}

