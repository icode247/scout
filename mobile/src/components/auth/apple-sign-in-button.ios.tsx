import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';

export function AppleSignInButton({ onPress, loading, disabled }: {
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  if (loading) {
    return <Button label="Continue with Apple" variant="primary" fullWidth loading />;
  }

  return (
    <View style={[styles.frame, disabled && styles.disabled]}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={26}
        onPress={disabled ? () => undefined : onPress}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%' },
  button: { width: '100%', height: 52 },
  disabled: { opacity: 0.48, pointerEvents: 'none' },
});
