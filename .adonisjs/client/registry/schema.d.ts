/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'home': {
    methods: ["GET","HEAD"]
    pattern: '/'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/public_controller').default['home']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/public_controller').default['home']>>>
    }
  }
  'public.post': {
    methods: ["GET","HEAD"]
    pattern: '/posts/:slug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { slug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/public_controller').default['post']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/public_controller').default['post']>>>
    }
  }
  'public.offline': {
    methods: ["GET","HEAD"]
    pattern: '/offline'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/public_controller').default['offline']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/public_controller').default['offline']>>>
    }
  }
  'public_content.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/public/content'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/public_content_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/public_content_controller').default['index']>>>
    }
  }
  'public_content.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/public/content/:slug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { slug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/public_content_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/public_content_controller').default['show']>>>
    }
  }
  'seo.robots': {
    methods: ["GET","HEAD"]
    pattern: '/robots.txt'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seo_controller').default['robots']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seo_controller').default['robots']>>>
    }
  }
  'seo.sitemap': {
    methods: ["GET","HEAD"]
    pattern: '/sitemap.xml'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seo_controller').default['sitemap']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seo_controller').default['sitemap']>>>
    }
  }
  'settings.get_auth_config': {
    methods: ["GET","HEAD"]
    pattern: '/api/auth/config'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['getAuthConfig']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['getAuthConfig']>>>
    }
  }
  'google_auth.status': {
    methods: ["GET","HEAD"]
    pattern: '/auth/google/status'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/google_auth_controller').default['status']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/google_auth_controller').default['status']>>>
    }
  }
  'google_auth.start': {
    methods: ["GET","HEAD"]
    pattern: '/auth/google'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/google_auth_controller').default['start']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/google_auth_controller').default['start']>>>
    }
  }
  'google_auth.callback': {
    methods: ["GET","HEAD"]
    pattern: '/auth/google/callback'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/google_auth_controller').default['callback']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/google_auth_controller').default['callback']>>>
    }
  }
  'new_account.create': {
    methods: ["GET","HEAD"]
    pattern: '/register'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['create']>>>
    }
  }
  'new_account.store': {
    methods: ["POST"]
    pattern: '/register'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
    }
  }
  'session.create': {
    methods: ["GET","HEAD"]
    pattern: '/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['create']>>>
    }
  }
  'session.store': {
    methods: ["POST"]
    pattern: '/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['store']>>>
    }
  }
  'legacy.signup.store': {
    methods: ["POST"]
    pattern: '/signup'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
    }
  }
  'session.destroy': {
    methods: ["POST"]
    pattern: '/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['destroy']>>>
    }
  }
  'session.me': {
    methods: ["GET","HEAD"]
    pattern: '/api/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['me']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['me']>>>
    }
  }
  'session.update_profile': {
    methods: ["PUT"]
    pattern: '/api/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['updateProfile']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['updateProfile']>>>
    }
  }
  'dashboard.index': {
    methods: ["GET","HEAD"]
    pattern: '/admin/dashboard'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/dashboard_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/dashboard_controller').default['index']>>>
    }
  }
  'dashboard.analytics_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/analytics'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/dashboard_controller').default['analyticsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/dashboard_controller').default['analyticsPage']>>>
    }
  }
  'dashboard.profile_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/profile'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/dashboard_controller').default['profilePage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/dashboard_controller').default['profilePage']>>>
    }
  }
  'users.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['page']>>>
    }
  }
  'users.generate_password': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/users/generate-password'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['generatePassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['generatePassword']>>>
    }
  }
  'users.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['index']>>>
    }
  }
  'users.store': {
    methods: ["POST"]
    pattern: '/api/admin/users'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['store']>>>
    }
  }
  'users.update': {
    methods: ["PUT"]
    pattern: '/api/admin/users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['update']>>>
    }
  }
  'users.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/users/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['destroy']>>>
    }
  }
  'roles.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/roles'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['page']>>>
    }
  }
  'roles.new_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/roles/new'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['newPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['newPage']>>>
    }
  }
  'roles.detail_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/roles/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['detailPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['detailPage']>>>
    }
  }
  'roles.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/roles'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['index']>>>
    }
  }
  'roles.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/roles/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['show']>>>
    }
  }
  'roles.store': {
    methods: ["POST"]
    pattern: '/api/admin/roles'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['store']>>>
    }
  }
  'roles.update': {
    methods: ["PUT"]
    pattern: '/api/admin/roles/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['update']>>>
    }
  }
  'roles.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/roles/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['destroy']>>>
    }
  }
  'permissions.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/permissions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['page']>>>
    }
  }
  'permissions.new_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/permissions/new'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['newPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['newPage']>>>
    }
  }
  'permissions.detail_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/permissions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['detailPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['detailPage']>>>
    }
  }
  'permissions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/permissions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['index']>>>
    }
  }
  'permissions.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/permissions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['show']>>>
    }
  }
  'permissions.store': {
    methods: ["POST"]
    pattern: '/api/admin/permissions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['store']>>>
    }
  }
  'permissions.update': {
    methods: ["PUT"]
    pattern: '/api/admin/permissions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['update']>>>
    }
  }
  'permissions.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/permissions/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['destroy']>>>
    }
  }
  'content.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/content'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['page']>>>
    }
  }
  'content.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/content'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['index']>>>
    }
  }
  'content.store': {
    methods: ["POST"]
    pattern: '/api/admin/content'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['store']>>>
    }
  }
  'content.update': {
    methods: ["PUT"]
    pattern: '/api/admin/content/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['update']>>>
    }
  }
  'content.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/content/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['destroy']>>>
    }
  }
  'cms.collections_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/cms/collections'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsPage']>>>
    }
  }
  'cms.collections_new_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/cms/collections/new'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsNewPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsNewPage']>>>
    }
  }
  'cms.collection_detail_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/cms/collections/:key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionDetailPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionDetailPage']>>>
    }
  }
  'cms.collections_index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/cms/collections'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsIndex']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsIndex']>>>
    }
  }
  'cms.collections_show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/cms/collections/:key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsShow']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsShow']>>>
    }
  }
  'cms.collections_store': {
    methods: ["POST"]
    pattern: '/api/admin/cms/collections'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsStore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsStore']>>>
    }
  }
  'cms.collections_update': {
    methods: ["PUT"]
    pattern: '/api/admin/cms/collections/:key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsUpdate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsUpdate']>>>
    }
  }
  'cms.collections_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/cms/collections/:key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsDestroy']>>>
    }
  }
  'cms.fields_store': {
    methods: ["POST"]
    pattern: '/api/admin/cms/collections/:key/fields'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['fieldsStore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['fieldsStore']>>>
    }
  }
  'cms.fields_update': {
    methods: ["PUT"]
    pattern: '/api/admin/cms/collections/:key/fields/:fieldKey'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; fieldKey: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['fieldsUpdate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['fieldsUpdate']>>>
    }
  }
  'cms.fields_reorder': {
    methods: ["PATCH"]
    pattern: '/api/admin/cms/collections/:key/fields/reorder'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['fieldsReorder']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['fieldsReorder']>>>
    }
  }
  'cms.fields_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/cms/collections/:key/fields/:fieldKey'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; fieldKey: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['fieldsDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['fieldsDestroy']>>>
    }
  }
  'cms.records_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/cms/:key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsPage']>>>
    }
  }
  'cms.new_record_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/cms/:key/new'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['newRecordPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['newRecordPage']>>>
    }
  }
  'cms.record_detail_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/cms/:key/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordDetailPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordDetailPage']>>>
    }
  }
  'cms.records_index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/cms/:key/records'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsIndex']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsIndex']>>>
    }
  }
  'cms.records_show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/cms/:key/records/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsShow']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsShow']>>>
    }
  }
  'cms.records_store': {
    methods: ["POST"]
    pattern: '/api/admin/cms/:key/records'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsStore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsStore']>>>
    }
  }
  'cms.records_update': {
    methods: ["PUT"]
    pattern: '/api/admin/cms/:key/records/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsUpdate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsUpdate']>>>
    }
  }
  'cms.records_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/cms/:key/records/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsDestroy']>>>
    }
  }
  'cms.revisions_index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/cms/:key/records/:id/revisions'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['revisionsIndex']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['revisionsIndex']>>>
    }
  }
  'cms.revisions_restore': {
    methods: ["POST"]
    pattern: '/api/admin/cms/:key/records/:id/revisions/:revisionId/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue; revisionId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['revisionsRestore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['revisionsRestore']>>>
    }
  }
  'media.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/media'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['page']>>>
    }
  }
  'media.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/media'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['index']>>>
    }
  }
  'media.store': {
    methods: ["POST"]
    pattern: '/api/admin/media'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['store']>>>
    }
  }
  'media.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/media/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['destroy']>>>
    }
  }
  'settings.settings_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/settings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['settingsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['settingsPage']>>>
    }
  }
  'settings.integrations_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/integrations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsPage']>>>
    }
  }
  'settings.integrations_google_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/integrations/google'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsGooglePage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsGooglePage']>>>
    }
  }
  'settings.integrations_captcha_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/integrations/captcha'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsCaptchaPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsCaptchaPage']>>>
    }
  }
  'settings.integrations_ga_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/integrations/google-analytics'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsGaPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsGaPage']>>>
    }
  }
  'settings.integrations_clarity_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/integrations/clarity'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsClarityPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['integrationsClarityPage']>>>
    }
  }
  'settings.get_web_settings': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/settings/web'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['getWebSettings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['getWebSettings']>>>
    }
  }
  'settings.update_web_settings': {
    methods: ["PUT"]
    pattern: '/api/admin/settings/web'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['updateWebSettings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['updateWebSettings']>>>
    }
  }
  'settings.get_integration_settings': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/settings/integrations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['getIntegrationSettings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['getIntegrationSettings']>>>
    }
  }
  'settings.update_integration_settings': {
    methods: ["PUT"]
    pattern: '/api/admin/settings/integrations'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['updateIntegrationSettings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['updateIntegrationSettings']>>>
    }
  }
}
