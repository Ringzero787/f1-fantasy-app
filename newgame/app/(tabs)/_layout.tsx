import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';

export default function TabsLayout() {
  const t = useTheme();
  const { isTablet } = useDeviceLayout();
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: t.bg,
          borderTopColor: t.lineSoft,
          borderTopWidth: 1,
          paddingTop: isTablet ? 10 : 6,
          paddingBottom: isTablet ? 36 : 28,
          height: isTablet ? 92 : 70,
        },
        tabBarLabelStyle: {
          fontFamily: t.fMono,
          fontSize: isTablet ? 15 : 10,
          fontWeight: '600',
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMute,
        tabBarShowLabel: true,
        tabBarItemStyle: { paddingTop: isTablet ? 6 : 4 },
        // Dot indicator: render a small accent square under the active tab
        tabBarIcon: ({ focused }) => (
          <View
            style={{
              width: isTablet ? 6 : 4,
              height: isTablet ? 6 : 4,
              borderRadius: isTablet ? 1.5 : 1,
              backgroundColor: focused ? t.accent : 'transparent',
              marginTop: -4,
            }}
          />
        ),
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerTitleStyle: { fontFamily: t.fDisp, fontWeight: '700' },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Lineup', headerShown: false }} />
      <Tabs.Screen name="garage" options={{ title: 'Garage' }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop' }} />
      <Tabs.Screen name="leagues" options={{ title: 'League', headerShown: false }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}
