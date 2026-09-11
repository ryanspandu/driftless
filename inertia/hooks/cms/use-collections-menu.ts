import { useCmsCollectionsList } from '~/hooks/api/use-cms-collections'
import { useAbility } from '~/components/providers/ability-provider'

export function useCollectionsMenu() {
  const { permissions } = useAbility()
  const query = useCmsCollectionsList()

  const collections = (query.data ?? []).filter((c) =>
    permissions.canAccessCollection(c.key)
  )

  return { collections, isLoading: query.isLoading, error: query.error }
}
