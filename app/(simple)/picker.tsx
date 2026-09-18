import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { GridPickerScreen } from '../../src/simple/grid/GridPickerScreen';

// Pick Team — pushed from the Team screen's EDIT → and open slots
// (`?tab=constructor` opens the constructor list).
export default function PickerScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <GridPickerScreen initialTab={tab === 'constructor' || tab === 'constructors' ? 'constructors' : 'drivers'} />;
}
