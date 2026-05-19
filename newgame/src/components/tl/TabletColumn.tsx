// On tablets, wrap content in a centered max-width column so the phone-shaped
// layout reads at phone density instead of being lost in tablet whitespace.
// On phones, this is a transparent pass-through.

import { View, ViewStyle, StyleProp } from 'react-native';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function TabletColumn({ children, style }: Props) {
  const { isTablet, contentMaxWidth } = useDeviceLayout();
  if (!isTablet) return <>{children}</>;
  return (
    <View style={[{ width: '100%', alignItems: 'center' }, style]}>
      <View style={{ width: '100%', maxWidth: contentMaxWidth }}>{children}</View>
    </View>
  );
}
