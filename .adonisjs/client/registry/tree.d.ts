/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  home: typeof routes['home']
  public: {
    post: typeof routes['public.post']
    offline: typeof routes['public.offline']
    page: typeof routes['public.page']
  }
  publicContent: {
    index: typeof routes['public_content.index']
    show: typeof routes['public_content.show']
  }
  publicCms: {
    records: typeof routes['public_cms.records']
    record: typeof routes['public_cms.record']
  }
  publicTemplates: {
    show: typeof routes['public_templates.show']
  }
  seo: {
    robots: typeof routes['seo.robots']
    sitemap: typeof routes['seo.sitemap']
  }
  settings: {
    getAuthConfig: typeof routes['settings.get_auth_config']
    settingsPage: typeof routes['settings.settings_page']
    applicationSettingsPage: typeof routes['settings.application_settings_page']
    integrationsPage: typeof routes['settings.integrations_page']
    integrationsGooglePage: typeof routes['settings.integrations_google_page']
    integrationsCaptchaPage: typeof routes['settings.integrations_captcha_page']
    integrationsGaPage: typeof routes['settings.integrations_ga_page']
    integrationsClarityPage: typeof routes['settings.integrations_clarity_page']
    getWebSettings: typeof routes['settings.get_web_settings']
    updateWebSettings: typeof routes['settings.update_web_settings']
    getIntegrationSettings: typeof routes['settings.get_integration_settings']
    updateIntegrationSettings: typeof routes['settings.update_integration_settings']
    integrationsApiTokensPage: typeof routes['settings.integrations_api_tokens_page']
    navConfig: typeof routes['settings.nav_config']
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
    trash: typeof routes['users.trash']
    store: typeof routes['users.store']
    restore: typeof routes['users.restore']
    forceDestroy: typeof routes['users.force_destroy']
    update: typeof routes['users.update']
    destroy: typeof routes['users.destroy']
  }
  roles: {
    page: typeof routes['roles.page']
    newPage: typeof routes['roles.new_page']
    detailPage: typeof routes['roles.detail_page']
    index: typeof routes['roles.index']
    trash: typeof routes['roles.trash']
    show: typeof routes['roles.show']
    store: typeof routes['roles.store']
    restore: typeof routes['roles.restore']
    forceDestroy: typeof routes['roles.force_destroy']
    update: typeof routes['roles.update']
    destroy: typeof routes['roles.destroy']
  }
  permissions: {
    page: typeof routes['permissions.page']
    newPage: typeof routes['permissions.new_page']
    detailPage: typeof routes['permissions.detail_page']
    index: typeof routes['permissions.index']
    trash: typeof routes['permissions.trash']
    show: typeof routes['permissions.show']
    store: typeof routes['permissions.store']
    restore: typeof routes['permissions.restore']
    forceDestroy: typeof routes['permissions.force_destroy']
    update: typeof routes['permissions.update']
    destroy: typeof routes['permissions.destroy']
  }
  content: {
    page: typeof routes['content.page']
    index: typeof routes['content.index']
    trash: typeof routes['content.trash']
    store: typeof routes['content.store']
    restore: typeof routes['content.restore']
    forceDestroy: typeof routes['content.force_destroy']
    update: typeof routes['content.update']
    destroy: typeof routes['content.destroy']
  }
  pages: {
    page: typeof routes['pages.page']
    edit: typeof routes['pages.edit']
    index: typeof routes['pages.index']
    trash: typeof routes['pages.trash']
    collections: typeof routes['pages.collections']
    store: typeof routes['pages.store']
    restore: typeof routes['pages.restore']
    forceDestroy: typeof routes['pages.force_destroy']
    revisions: typeof routes['pages.revisions']
    restoreRevision: typeof routes['pages.restore_revision']
    show: typeof routes['pages.show']
    update: typeof routes['pages.update']
    destroy: typeof routes['pages.destroy']
  }
  templates: {
    page: typeof routes['templates.page']
    edit: typeof routes['templates.edit']
    index: typeof routes['templates.index']
    store: typeof routes['templates.store']
    duplicate: typeof routes['templates.duplicate']
    setDefault: typeof routes['templates.set_default']
    show: typeof routes['templates.show']
    update: typeof routes['templates.update']
    destroy: typeof routes['templates.destroy']
  }
  cms: {
    collectionsPage: typeof routes['cms.collections_page']
    collectionsNewPage: typeof routes['cms.collections_new_page']
    collectionDetailPage: typeof routes['cms.collection_detail_page']
    collectionsIndex: typeof routes['cms.collections_index']
    collectionsTrash: typeof routes['cms.collections_trash']
    collectionsShow: typeof routes['cms.collections_show']
    collectionsStore: typeof routes['cms.collections_store']
    collectionsRestore: typeof routes['cms.collections_restore']
    collectionsForceDestroy: typeof routes['cms.collections_force_destroy']
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
    recordsTrash: typeof routes['cms.records_trash']
    recordsShow: typeof routes['cms.records_show']
    recordsStore: typeof routes['cms.records_store']
    recordsRestore: typeof routes['cms.records_restore']
    recordsForceDestroy: typeof routes['cms.records_force_destroy']
    recordsUpdate: typeof routes['cms.records_update']
    recordsDestroy: typeof routes['cms.records_destroy']
    revisionsIndex: typeof routes['cms.revisions_index']
    revisionsRestore: typeof routes['cms.revisions_restore']
  }
  media: {
    page: typeof routes['media.page']
    index: typeof routes['media.index']
    trash: typeof routes['media.trash']
    store: typeof routes['media.store']
    restore: typeof routes['media.restore']
    forceDestroy: typeof routes['media.force_destroy']
    destroy: typeof routes['media.destroy']
  }
  apiTokens: {
    index: typeof routes['api_tokens.index']
    store: typeof routes['api_tokens.store']
    destroy: typeof routes['api_tokens.destroy']
  }
  plugins: {
    page: typeof routes['plugins.page']
    menu: typeof routes['plugins.menu']
    index: typeof routes['plugins.index']
    toggle: typeof routes['plugins.toggle']
  }
  modules: {
    menu: typeof routes['modules.menu']
    index: typeof routes['modules.index']
    toggle: typeof routes['modules.toggle']
  }
  v1: {
    content: {
      index: typeof routes['v1.content.index']
      show: typeof routes['v1.content.show']
      store: typeof routes['v1.content.store']
      update: typeof routes['v1.content.update']
      destroy: typeof routes['v1.content.destroy']
    }
    cms: {
      index: typeof routes['v1.cms.index']
      show: typeof routes['v1.cms.show']
      store: typeof routes['v1.cms.store']
      update: typeof routes['v1.cms.update']
      destroy: typeof routes['v1.cms.destroy']
    }
  }
  admin: {
    page: typeof routes['admin.page']
    index: typeof routes['admin.index']
    store: typeof routes['admin.store']
    update: typeof routes['admin.update']
    destroy: typeof routes['admin.destroy']
  }
  ctrl: {
    page: typeof routes['ctrl.page']
    index: typeof routes['ctrl.index']
    store: typeof routes['ctrl.store']
    update: typeof routes['ctrl.update']
    destroy: typeof routes['ctrl.destroy']
  }
  pagesPublic: {
    show: typeof routes['pages_public.show']
  }
}
