import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { colors, fonts } from '@/theme/tokens';

type TabIconProps = { color: ColorValue; size: number };
function DiscoverIcon({ color, size }: TabIconProps) { return <Icon name="layers" color={color} size={size} />; }
function ApplicationsIcon({ color, size }: TabIconProps) { return <Icon name="briefcase" color={color} size={size} />; }
function ProfileIcon({ color, size }: TabIconProps) { return <Icon name="user" color={color} size={size} />; }

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 72,
          paddingTop: 7,
          paddingBottom: 9,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 10 },
        sceneStyle: { backgroundColor: colors.brandSurface },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Discover', tabBarIcon: DiscoverIcon }} />
      <Tabs.Screen name="activity" options={{ title: 'Applications', tabBarIcon: ApplicationsIcon }} />
      <Tabs.Screen name="me" options={{ title: 'My Scout', tabBarIcon: ProfileIcon }} />
    </Tabs>
  );
}
