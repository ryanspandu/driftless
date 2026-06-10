/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  home: typeof routes['home']
  public: {
    post: typeof routes['public.post']
    offline: typeof routes['public.offline']
  }
  publicContent: {
    index: typeof routes['public_content.index']
    show: typeof routes['public_content.show']
  }
  seo: {
    robots: typeof routes['seo.robots']
    sitemap: typeof routes['seo.sitemap']
  }
  settings: {
    getAuthConfig: typeof routes['settings.get_auth_config']
    settingsPage: typeof routes['settings.settings_page']
    integrationsPage: typeof routes['settings.integrations_page']
    integrationsGooglePage: typeof routes['settings.integrations_google_page']
    integrationsCaptchaPage: typeof routes['settings.integrations_captcha_page']
    integrationsGaPage: typeof routes['settings.integrations_ga_page']
    integrationsClarityPage: typeof routes['settings.integrations_clarity_page']
    getWebSettings: typeof routes['settings.get_web_settings']
    updateWebSettings: typeof routes['settings.update_web_settings']
    getIntegrationSettings: typeof routes['settings.get_integration_settings']
    updateIntegrationSettings: typeof routes['settings.update_integration_settings']
  }
  googleAuth: {
    status: typeof routes['google_auth.status']
    start: typeof routes['google_auth.start']
    callback: typeof routes['google_auth.callback']
  }
  newAccount: {
    create: typeof routes['new_account.create']
    store: typeof routes['new_account.store']
  }
  session: {
    create: typeof routes['session.create']
    store: typeof routes['session.store']
    destroy: typeof routes['session.destroy']
    me: typeof routes['session.me']
    updateProfile: typeof routes['session.update_profile']
  }
  legacy: {
    signup: {
      store: typeof routes['legacy.signup.store']
    }
  }
  dashboard: {
    index: typeof routes['dashboard.index']
    analyticsPage: typeof routes['dashboard.analytics_page']
    profilePage: typeof routes['dashboard.profile_page']
  }
  users: {
    page: typeof routes['users.page']
    generatePassword: typeof routes['users.generate_password']
    index: typeof routes['users.index']
    store: typeof routes['users.store']
    update: typeof routes['users.update']
    destroy: typeof routes['users.destroy']
  }
  roles: {
    page: typeof routes['roles.page']
    newPage: typeof routes['roles.new_page']
    detailPage: typeof routes['roles.detail_page']
    index: typeof routes['roles.index']
    show: typeof routes['roles.show']
    store: typeof routes['roles.store']
    update: typeof routes['roles.update']
    destroy: typeof routes['roles.destroy']
  }
  permissions: {
    page: typeof routes['permissions.page']
    newPage: typeof routes['permissions.new_page']
    detailPage: typeof routes['permissions.detail_page']
    index: typeof routes['permissions.index']
    show: typeof routes['permissions.show']
    store: typeof routes['permissions.store']
    update: typeof routes['permissions.update']
    destroy: typeof routes['permissions.destroy']
  }
  content: {
    page: typeof routes['content.page']
    index: typeof routes['content.index']
    store: typeof routes['content.store']
    update: typeof routes['content.update']
    destroy: typeof routes['content.destroy']
  }
  cms: {
    collectionsPage: typeof routes['cms.collections_page']
    collectionsNewPage: typeof routes['cms.collections_new_page']
    collectionDetailPage: typeof routes['cms.collection_detail_page']
    collectionsIndex: typeof routes['cms.collections_index']
    collectionsShow: typeof routes['cms.collections_show']
    collectionsStore: typeof routes['cms.collections_store']
    collectionsUpdate: typeof routes['cms.collections_update']
    collectionsDestroy: typeof routes['cms.collections_destroy']
    fieldsStore: typeof routes['cms.fields_store']
    fieldsUpdate: typeof routes['cms.fields_update']
    fieldsReorder: typeof routes['cms.fields_reorder']
    fieldsDestroy: typeof routes['cms.fields_destroy']
    recordsPage: typeof routes['cms.records_page']
    newRecordPage: typeof routes['cms.new_record_page']
    recordDetailPage: typeof routes['cms.record_detail_page']
    recordsIndex: typeof routes['cms.records_index']
    recordsShow: typeof routes['cms.records_show']
    recordsStore: typeof routes['cms.records_store']
    recordsUpdate: typeof routes['cms.records_update']
    recordsDestroy: typeof routes['cms.records_destroy']
    revisionsIndex: typeof routes['cms.revisions_index']
    revisionsRestore: typeof routes['cms.revisions_restore']
  }
  media: {
    page: typeof routes['media.page']
    index: typeof routes['media.index']
    store: typeof routes['media.store']
    destroy: typeof routes['media.destroy']
  }
}
