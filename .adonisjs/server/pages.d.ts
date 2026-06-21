import '@adonisjs/inertia/types'

import type React from 'react'
import type { Prettify } from '@adonisjs/core/types/common'

type ExtractProps<T> =
  T extends React.FC<infer Props>
    ? Prettify<Omit<Props, 'children'>>
    : T extends React.Component<infer Props>
      ? Prettify<Omit<Props, 'children'>>
      : never

declare module '@adonisjs/inertia/types' {
  export interface InertiaPages {
    'admin/analytics': ExtractProps<(typeof import('../../inertia/pages/admin/analytics.tsx'))['default']>
    'admin/cms/collection_detail': ExtractProps<(typeof import('../../inertia/pages/admin/cms/collection_detail.tsx'))['default']>
    'admin/cms/collections': ExtractProps<(typeof import('../../inertia/pages/admin/cms/collections.tsx'))['default']>
    'admin/cms/collections/new': ExtractProps<(typeof import('../../inertia/pages/admin/cms/collections/new.tsx'))['default']>
    'admin/cms/record_detail': ExtractProps<(typeof import('../../inertia/pages/admin/cms/record_detail.tsx'))['default']>
    'admin/cms/records': ExtractProps<(typeof import('../../inertia/pages/admin/cms/records.tsx'))['default']>
    'admin/content': ExtractProps<(typeof import('../../inertia/pages/admin/content.tsx'))['default']>
    'admin/dashboard': ExtractProps<(typeof import('../../inertia/pages/admin/dashboard.tsx'))['default']>
    'admin/integrations': ExtractProps<(typeof import('../../inertia/pages/admin/integrations.tsx'))['default']>
    'admin/integrations/captcha': ExtractProps<(typeof import('../../inertia/pages/admin/integrations/captcha.tsx'))['default']>
    'admin/integrations/clarity': ExtractProps<(typeof import('../../inertia/pages/admin/integrations/clarity.tsx'))['default']>
    'admin/integrations/google-analytics': ExtractProps<(typeof import('../../inertia/pages/admin/integrations/google-analytics.tsx'))['default']>
    'admin/integrations/google': ExtractProps<(typeof import('../../inertia/pages/admin/integrations/google.tsx'))['default']>
    'admin/media': ExtractProps<(typeof import('../../inertia/pages/admin/media.tsx'))['default']>
    'admin/pages/builder': ExtractProps<(typeof import('../../inertia/pages/admin/pages/builder.tsx'))['default']>
    'admin/pages/index': ExtractProps<(typeof import('../../inertia/pages/admin/pages/index.tsx'))['default']>
    'admin/permissions': ExtractProps<(typeof import('../../inertia/pages/admin/permissions.tsx'))['default']>
    'admin/permissions/new': ExtractProps<(typeof import('../../inertia/pages/admin/permissions/new.tsx'))['default']>
    'admin/permissions/show': ExtractProps<(typeof import('../../inertia/pages/admin/permissions/show.tsx'))['default']>
    'admin/plugins': ExtractProps<(typeof import('../../inertia/pages/admin/plugins.tsx'))['default']>
    'admin/profile': ExtractProps<(typeof import('../../inertia/pages/admin/profile.tsx'))['default']>
    'admin/roles': ExtractProps<(typeof import('../../inertia/pages/admin/roles.tsx'))['default']>
    'admin/roles/new': ExtractProps<(typeof import('../../inertia/pages/admin/roles/new.tsx'))['default']>
    'admin/roles/show': ExtractProps<(typeof import('../../inertia/pages/admin/roles/show.tsx'))['default']>
    'admin/settings': ExtractProps<(typeof import('../../inertia/pages/admin/settings.tsx'))['default']>
    'admin/templates/builder': ExtractProps<(typeof import('../../inertia/pages/admin/templates/builder.tsx'))['default']>
    'admin/templates/index': ExtractProps<(typeof import('../../inertia/pages/admin/templates/index.tsx'))['default']>
    'admin/users': ExtractProps<(typeof import('../../inertia/pages/admin/users.tsx'))['default']>
    'auth/login': ExtractProps<(typeof import('../../inertia/pages/auth/login.tsx'))['default']>
    'auth/signup': ExtractProps<(typeof import('../../inertia/pages/auth/signup.tsx'))['default']>
    'errors/not_found': ExtractProps<(typeof import('../../inertia/pages/errors/not_found.tsx'))['default']>
    'errors/server_error': ExtractProps<(typeof import('../../inertia/pages/errors/server_error.tsx'))['default']>
    'home': ExtractProps<(typeof import('../../inertia/pages/home.tsx'))['default']>
    'offline': ExtractProps<(typeof import('../../inertia/pages/offline.tsx'))['default']>
    'posts/show': ExtractProps<(typeof import('../../inertia/pages/posts/show.tsx'))['default']>
    'public/page_ssr': ExtractProps<(typeof import('../../inertia/pages/public/page_ssr.tsx'))['default']>
    'public/page': ExtractProps<(typeof import('../../inertia/pages/public/page.tsx'))['default']>
  }
}
