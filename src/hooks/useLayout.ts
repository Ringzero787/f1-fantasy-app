import { useWindowDimensions } from 'react-native';

export const SIDE_RAIL_WIDTH = 72;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const isLandscape = isTablet && width > height;
  const numColumns = isLandscape ? 2 : 1;
  const contentWidth = isLandscape ? width - SIDE_RAIL_WIDTH : width;

  return {
    isTablet,
    isLandscape,
    numColumns,
    contentWidth,
    screenWidth: width,
    screenHeight: height,
  };
}
