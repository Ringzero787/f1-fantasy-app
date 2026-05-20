import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function TabBarItemContent({
  icon,
  focused,
  isTablet,
  scale,
  activeColor,
  inactiveColor,
}: {
  icon: IconName;
  focused: boolean;
  isTablet: boolean;
  scale: (n: number) => number;
  activeColor: string;
  inactiveColor: string;
}) {
  const iconSize = scale(isTablet ? 28 : 22);
  const dotSize = isTablet ? 6 : 4;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <MaterialCommunityIcons
        name={icon}
        size={iconSize}
        color={focused ? activeColor : inactiveColor}
      />
      <View
        style={{
          marginTop: 4,
          width: dotSize,
          height: dotSize,
          borderRadius: dotSize / 4,
          backgroundColor: focused ? activeColor : 'transparent',
        }}
      />
    </View>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const { isTablet, scale } = useDeviceLayout();
  const insets = useSafeAreaInsets();
  const padBottom = (isTablet ? 14 : 10) + insets.bottom;
  const padTop = isTablet ? 10 : 6;
  const baseHeight = scale(isTablet ? 56 : 44);

  const renderItem = (icon: IconName) => ({ focused }: { focused: boolean }) => (
    <TabBarItemContent
      icon={icon}
      focused={focused}
      isTablet={isTablet}
      scale={scale}
      activeColor={t.accent}
      inactiveColor={t.textMute}
    />
  );

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: t.bg,
          borderTopColor: t.lineSoft,
          borderTopWidth: 1,
          paddingTop: padTop,
          paddingBottom: padBottom,
          height: baseHeight + padTop + padBottom,
        },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMute,
        tabBarShowLabel: false,
        tabBarItemStyle: { paddingTop: isTablet ? 6 : 4 },
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        headerTitleStyle: { fontFamily: t.fDisp, fontWeight: '700' },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Lineup', headerShown: false, tabBarIcon: renderItem('flag-checkered') }} />
      <Tabs.Screen name="garage" options={{ title: 'Garage', tabBarIcon: renderItem('garage-variant') }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: renderItem('cart-outline') }} />
      <Tabs.Screen name="leagues" options={{ title: 'League', headerShown: false, tabBarIcon: renderItem('trophy-outline') }} />
      <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: renderItem('account-circle-outline') }} />
    </Tabs>
  );
}
