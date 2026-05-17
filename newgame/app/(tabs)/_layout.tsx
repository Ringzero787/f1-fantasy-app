import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: t.bg,
          borderTopColor: t.lineSoft,
          borderTopWidth: 1,
          paddingTop: 6,
          paddingBottom: 28,
          height: 70,
        },
        tabBarLabelStyle: {
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMute,
        tabBarShowLabel: true,
        tabBarItemStyle: { paddingTop: 4 },
        // Dot indicator: render a tiny accent square under the active tab
        tabBarIcon: ({ focused }) => (
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 1,
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
