import { type ReactElement, type ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import { toast, Toaster } from 'sonner'
import { useEffect } from 'react'
import { type Data } from '@generated/data'
import { AuthShell } from '~/components/auth/auth-shell'

export default function AuthLayout({
  children,
}: {
  children: ReactElement<Data.SharedProps> | ReactNode
}) {
  const { url, props } = usePage<Data.SharedProps>()

  useEffect(() => {
    toast.dismiss()
  }, [url])

  useEffect(() => {
    if (props.flash?.error) toast.error(props.flash.error)
    if (props.flash?.success) toast.success(props.flash.success)
  })

  return (
    <AuthShell redirectIfAuthenticated>
      {children}
      <Toaster position="top-center" richColors />
    </AuthShell>
  )
}
