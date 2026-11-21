import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1c1c1a',
    background: '#f7f7f5',
    backgroundElement: '#ffffff',
    backgroundSelected: '#e6f2f0',
    textSecondary: '#6b6b66',
    line: '#e4e4df',
    accent: '#0f766e',
    accentText: '#ffffff',
    danger: '#b42318',
  },
  dark: {
    text: '#ededea',
    background: '#121211',
    backgroundElement: '#1c1c1a',
    backgroundSelected: '#173a36',
    textSecondary: '#a3a39d',
    line: '#2f2f2c',
    accent: '#2dd4bf',
    accentText: '#062b27',
    danger: '#f97066',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', serif: 'ui-serif', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', serif: 'serif', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'var(--font-display)', serif: 'var(--font-serif)', rounded: 'var(--font-rounded)', mono: 'var(--font-mono)' },
});

export const Spacing = { half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64 } as const;
