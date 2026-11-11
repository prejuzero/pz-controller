import type { ExpoConfig } from 'expo/config';

/**
 * Configuração do app por ambiente (HU63), sem segredos: o endereço da API vem de
 * EXPO_PUBLIC_API_URL (público por definição; vai no pacote do app). O esquema
 * `br.com.prejuzero.app` recebe o retorno do login OAuth (APP_OAUTH_REDIRECT_URIS na API, HU65).
 */
const config: ExpoConfig = {
  name: 'PrejuZero',
  slug: 'prejuzero',
  version: '0.1.0',
  scheme: 'br.com.prejuzero.app',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: { bundleIdentifier: 'br.com.prejuzero.app', supportsTablet: true },
  android: { package: 'br.com.prejuzero.app' },
  plugins: ['expo-router'],
  experiments: { typedRoutes: true },
};

export default config;
