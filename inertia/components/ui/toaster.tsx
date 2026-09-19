import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useTheme } from 'next-themes'

/**
 * The app's toast host — every layout mounts this rather than sonner's bare
 * `<Toaster>`, so position, colours and theme are set in one place.
 *
 * The theme follows the admin's light/dark toggle unless a caller pins it (the
 * public site is light-only, whatever the toggle says).
 */
export function Toaster({ position = 'top-center', theme, ...props }: ToasterProps) {
  const { resolvedTheme } = useTheme()
  return (
    <Sonner
      richColors
      position={position}
      theme={theme ?? (resolvedTheme === 'dark' ? 'dark' : 'light')}
      {...props}
    />
  )
}
