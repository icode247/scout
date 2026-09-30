import { Platform } from 'react-native';

export const colors = {
  brand: '#7FC92B',
  brandBright: '#9DDE47',
  brandSoft: '#E7FFD2',
  brandSurface: '#F4FFEB',
  forest: '#10210D',
  forestRaised: '#193016',
  ink: '#14210F',
  inkSoft: '#3D4A35',
  inkMuted: '#69735F',
  line: 'rgba(20, 33, 15, 0.11)',
  lineStrong: 'rgba(20, 33, 15, 0.18)',
  white: '#FFFFFF',
  surface: '#F7FAF5',
  surfaceSoft: '#ECFADF',
  surfaceSunken: '#DFF1CF',
  signal: '#1F9D6A',
  signalDark: '#15724E',
  signalSoft: '#D7F4E4',
  human: '#D88A24',
  humanDark: '#9D5F12',
  humanSoft: '#FFF0D8',
  danger: '#D65353',
  dangerSoft: '#FDEBEC',
  warning: '#B86B14',
  warningSoft: '#FFF7EB',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

export const fonts = {
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyExtraBold: 'Manrope_800ExtraBold',
  displayMedium: 'SpaceGrotesk_500Medium',
  displaySemiBold: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
} as const;

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: colors.forest,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.09,
      shadowRadius: 24,
    },
    android: { elevation: 4 },
    default: {
      boxShadow: '0 14px 42px rgba(16, 33, 13, 0.10)',
    },
  }),
  raised: Platform.select({
    ios: {
      shadowColor: colors.forest,
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.16,
      shadowRadius: 28,
    },
    android: { elevation: 8 },
    default: {
      boxShadow: '0 20px 54px rgba(16, 33, 13, 0.16)',
    },
  }),
} as const;

export const layout = {
  maxWidth: 680,
  horizontal: 20,
  tabBarHeight: 70,
} as const;

