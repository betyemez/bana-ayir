import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Screen({ children, ...props }: ScrollViewProps & { children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled" {...props}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.line }, style]}
      {...props}
    />
  );
}

export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  style,
  ...props
}: PressableProps & { title: string; variant?: 'primary' | 'ghost' | 'danger'; loading?: boolean }) {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.button,
        primary
          ? { backgroundColor: theme.accent }
          : { borderWidth: 1, borderColor: theme.line, backgroundColor: theme.backgroundElement },
        (disabled || loading) && { opacity: 0.5 },
        state.pressed && { opacity: 0.8 },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator color={primary ? theme.accentText : theme.text} />
      ) : (
        <ThemedText
          type="smallBold"
          style={{ color: primary ? theme.accentText : variant === 'danger' ? theme.danger : theme.text }}>
          {title}
        </ThemedText>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? theme.accent : theme.line, backgroundColor: selected ? theme.accent : theme.backgroundElement },
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.accentText : theme.text, textAlign: 'center' }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        { borderColor: theme.line, backgroundColor: theme.backgroundElement, color: theme.text },
        props.style,
      ]}
    />
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={style}>
      {children}
    </ThemedText>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <ThemedText type="small" style={{ color: theme.danger }}>
      {children}
    </ThemedText>
  );
}

export const styles = StyleSheet.create({
  screen: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six * 2 },
  card: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  button: { minHeight: 44, borderRadius: 10, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
