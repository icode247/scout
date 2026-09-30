import { Button } from '@/components/ui/button';

export function AppleSignInButton({ onPress, loading, disabled }: {
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}) {
  return (
    <Button
      label="Continue with Apple"
      variant="primary"
      fullWidth
      loading={loading}
      disabled={disabled}
      onPress={onPress}
    />
  );
}
