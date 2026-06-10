import { useEffect } from 'react'
import { useOffline } from '~/components/providers/offline-provider'
import { createContentHandler } from '~/lib/offline/handlers/content-handler'
import { createCmsRecordHandler } from '~/lib/offline/handlers/cms-record-handler'
import { createUsersHandler } from '~/lib/offline/handlers/users-handler'

export function useRegisterOfflineHandlers(): void {
  const { engine } = useOffline()

  useEffect(() => {
    if (!engine) return
    engine.registerHandler(createContentHandler())
    engine.registerHandler(createUsersHandler())
    engine.registerHandler(createCmsRecordHandler())
    void engine.trigger()
  }, [engine])
}
