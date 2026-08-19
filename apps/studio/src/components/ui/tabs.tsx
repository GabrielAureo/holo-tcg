import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root {...props} />;
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('grid grid-cols-2 gap-1 bg-[#090a10] p-[3px]', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn('border-0 bg-transparent px-2.5 py-2 font-mono text-[9px] uppercase text-[#6e707b] outline-none transition-colors data-[state=active]:bg-[#20222c] data-[state=active]:text-white focus-visible:ring-1 focus-visible:ring-[var(--acid)]', className)} {...props} />;
}
