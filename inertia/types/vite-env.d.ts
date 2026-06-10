declare module 'virtual:serwist' {
  export function registerSW(options?: { immediate?: boolean }): void
}

declare module 'react-google-recaptcha' {
  import type { ComponentType } from 'react'
  const ReCAPTCHA: ComponentType<{
    sitekey: string
    theme?: 'light' | 'dark'
    onChange?: (token: string | null) => void
    onExpired?: () => void
  }>
  export default ReCAPTCHA
}
