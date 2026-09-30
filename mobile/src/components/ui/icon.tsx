import type { ComponentProps } from 'react';
import Feather from '@expo/vector-icons/Feather';
import type { ColorValue } from 'react-native';

type IconName = ComponentProps<typeof Feather>['name'];
type Props = { name: IconName; size?: number; color?: ColorValue };

export function Icon({ name, size = 20, color }: Props) {
  return <Feather name={name} size={size} color={color} />;
}

export type { IconName };
