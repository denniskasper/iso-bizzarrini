import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * One dominant action per screen, and it is the only thing wearing the champagne fill. Everything else
 * is an outline or a piece of plain text that happens to be clickable.
 */
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap select-none',
    'rounded-md font-medium transition-colors duration-150 ease-[var(--ease-out-quick)]',
    'disabled:pointer-events-none disabled:opacity-40',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-contrast hover:bg-accent-hover',
        outline: 'border border-line-strong bg-surface-raised text-text hover:bg-surface-sunken',
        ghost: 'text-muted hover:bg-surface-sunken hover:text-text',
        link: 'text-accent-ink underline-offset-4 hover:underline',
      },
      size: {
        // Nothing interactive is under 44px — cold hands, thick gloves, a phone held at arm's length.
        md: 'h-control px-5 text-sm',
        lg: 'h-control-lg px-7 text-base',
        icon: 'size-control',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'md',
    },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
