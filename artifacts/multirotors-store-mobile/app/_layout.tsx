import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { Appearance, Platform } from 'react-native';
import { setBaseUrl } from '@workspace/api-client-react';

// Force dark mode on native (iOS/Android) regardless of device system preference.
// react-native-web does not implement setColorScheme; app.json userInterfaceStyle: "dark"
// covers the native side, and the dark palette is applied unconditionally in component code.
if (Platform.OS !== 'web' && typeof Appearance.setColorScheme === 'function') {
  Appearance.setColorScheme('dark');
}

// Configure API base URL for Expo bundles (bypass proxy; use absolute URL)
setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="shop/[handle]" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Track whether the splash screen has fully been dismissed so we can
  // keep the status bar hidden until the transition is complete.
  const [splashDismissed, setSplashDismissed] = React.useState(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().then(() => setSplashDismissed(true));
    }
  }, [fontsLoaded, fontError]);

  // While the splash is still active, mount a hidden StatusBar so the
  // system doesn't show it before the app is ready.
  if (!fontsLoaded && !fontError) {
    return <StatusBar hidden />;
  }

  return (
    <SafeAreaProvider>
      {/* Keep the status bar hidden until the splash finishes animating out */}
      <StatusBar style="light" hidden={!splashDismissed} />
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <RootLayoutNav />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
