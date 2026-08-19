import { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border font-mono text-[10px] uppercase tracking-[.06em] transition-colors outline-none disabled:pointer-events-none disabled:opacity-45 disabled:saturate-0 focus-visible:ring-1 focus-visible:ring-[var(--acid)]',
  {
    variants: {
      variant: {
        primary: 'border-[var(--acid)] bg-[var(--acid)] text-[#10110d] hover:brightness-105',
        secondary: 'border-[#30333e] bg-transparent text-[#979aa5] hover:border-[#5d616e] hover:text-white',
        ghost: 'border-transparent bg-transparent text-[#6e707b] hover:bg-[#20222c] hover:text-white',
        surface: 'border-[#30333e] bg-[#11131b] text-[#777b87] hover:border-[#656a78] hover:text-[#f1f2f5]',
      },
      size: {
        default: 'h-10 px-3',
        compact: 'h-9 px-2.5 text-[9px]',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
