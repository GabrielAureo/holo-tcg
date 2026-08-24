import * as SliderPrimitive from '@radix-ui/react-slider';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  const value = props.value ?? props.defaultValue ?? [props.min ?? 0];
  const thumbLabel = props['aria-label'];
  const thumbLabelledBy = props['aria-labelledby'];
  return (
    <SliderPrimitive.Root className={cn('relative flex min-h-6 w-full touch-none select-none items-center py-2', className)} {...props}>
      <SliderPrimitive.Track className="relative h-0.5 w-full grow overflow-hidden bg-[#343641]">
        <SliderPrimitive.Range className="absolute h-full bg-[var(--acid)]" />
      </SliderPrimitive.Track>
      {value.map((_, index) => (
        <SliderPrimitive.Thumb key={index} aria-label={thumbLabel} aria-labelledby={thumbLabelledBy} className="block size-3 rounded-full bg-[var(--acid)] shadow-[0_0_0_4px_#d4ff4520] outline-none focus-visible:ring-2 focus-visible:ring-[var(--acid)] disabled:pointer-events-none disabled:opacity-50" />
      ))}
    </SliderPrimitive.Root>
  );
}
