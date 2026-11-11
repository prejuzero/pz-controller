import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

/** Raiz do app (HU63): cache do TanStack Query e navegação por arquivo (expo-router). */
export default function Raiz() {
  const [cache] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={cache}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
