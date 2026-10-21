// shadcn/ui-style Radix menu primitives, using the app's shared neutral theme.
import * as React from 'react'
import { DropdownMenu as MenuPrimitive } from 'radix-ui'
import { cn } from '../../lib/utils'

const DropdownMenu = MenuPrimitive.Root
const DropdownMenuTrigger = MenuPrimitive.Trigger

function DropdownMenuContent({ className, sideOffset = 8, ...props }: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return <MenuPrimitive.Portal><MenuPrimitive.Content
    data-slot="dropdown-menu-content" sideOffset={sideOffset}
    className={cn('z-[600] min-w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md', className)}
    {...props}/></MenuPrimitive.Portal>
}

function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return <MenuPrimitive.Item data-slot="dropdown-menu-item"
    className={cn('relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:shrink-0', className)}
    {...props}/>
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem }
