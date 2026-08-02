import { MoonStar, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/lib/theme';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const goingTo = theme === 'dark' ? 'light' : 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={`Switch to the ${goingTo} theme`}
      title={`Switch to the ${goingTo} theme`}
    >
      {theme === 'dark' ? <Sun aria-hidden /> : <MoonStar aria-hidden />}
    </Button>
  );
}
