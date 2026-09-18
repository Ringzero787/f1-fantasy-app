import React, { useState, useCallback } from 'react';
import { View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSimpleTheme } from '../../src/simple/hooks/useSimpleTheme';
import { ScreenHeader } from '../../src/simple/grid/GridBits';
import { SimpleMarketPanel } from '../../src/simple/components/SimpleMarketPanel';
import { useAdminStore } from '../../src/store/admin.store';

// Interim Pick Team route: Grid header over the existing Market panel until
// F-055 replaces the body with the Picker list, contract sheet and save summary.
export default function PickerScreen() {
  const { colors, isDark } = useSimpleTheme();
  const [refreshing, setRefreshing] = useState(false);
  const loadMarketCache = useAdminStore((s) => s.loadMarketCache);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMarketCache();
    setRefreshing(false);
  }, [loadMarketCache]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: 12 }}>
        <ScreenHeader statusLeft="← CANCEL" onStatusLeftPress={() => router.back()} title="Pick Team" />
      </View>
      <View style={{ flex: 1, marginTop: 8 }}>
        <SimpleMarketPanel refreshing={refreshing} onRefresh={onRefresh} />
      </View>
    </SafeAreaView>
  );
}
