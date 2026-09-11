import { Link, router } from '@inertiajs/react'
import { LogOut, Settings, User } from 'lucide-react'
import { buttonVariants } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { useAbility } from '~/components/providers/ability-provider'
import api from '~/lib/api'
import { cn } from '~/lib/utils'

export function UserAccountDropdown() {
  const { me } = useAbility()
  const initials = me
    ? `${me.firstName[0] ?? ''}${me.lastName?.[0] ?? ''}`.toUpperCase() || me.email[0]?.toUpperCase()
    : 'U'

  async function signOut() {
    await api.post('/logout')
    router.visit('/login')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'size-10 cursor-pointer rounded-full p-0'
        )}
        aria-label="Open account menu"
      >
        <Avatar>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44" sideOffset={8}>
        <DropdownMenuItem className="cursor-pointer gap-2" render={<Link href="/admin/profile" />}>
          <User className="size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2" render={<Link href="/admin/settings" />}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer gap-2 text-destructive" onClick={() => void signOut()}>
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
