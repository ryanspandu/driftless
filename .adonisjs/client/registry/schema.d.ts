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
  'public_cms.records': {
    methods: ["GET","HEAD"]
    pattern: '/api/public/cms/:key/records'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/public_cms_controller').default['records']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/public_cms_controller').default['records']>>>
    }
  }
  'public_cms.record': {
    methods: ["GET","HEAD"]
    pattern: '/api/public/cms/:key/records/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/public_cms_controller').default['record']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/public_cms_controller').default['record']>>>
    }
  }
  'public_templates.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/public/templates/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/public_templates_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/public_templates_controller').default['show']>>>
    }
  }
  'media.serve': {
    methods: ["GET","HEAD"]
    pattern: '/media/*'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { '*': ParamValue[] }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['serve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['serve']>>>
    }
  }
  'media.serveLegacy': {
    methods: ["GET","HEAD"]
    pattern: '/uploads/*'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { '*': ParamValue[] }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['serve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['serve']>>>
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
  'health.public': {
    methods: ["GET","HEAD"]
    pattern: '/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/health_controller').default['public']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/health_controller').default['public']>>>
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
  'password_reset.create': {
    methods: ["GET","HEAD"]
    pattern: '/forgot-password'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['create']>>>
    }
  }
  'password_reset.store': {
    methods: ["POST"]
    pattern: '/forgot-password'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['store']>>>
    }
  }
  'password_reset.edit': {
    methods: ["GET","HEAD"]
    pattern: '/reset-password/:token'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { token: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['edit']>>>
    }
  }
  'password_reset.update': {
    methods: ["POST"]
    pattern: '/reset-password'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/password_reset_controller').default['update']>>>
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
  'users.trash': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/users/trash'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['trash']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['trash']>>>
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
  'users.restore': {
    methods: ["POST"]
    pattern: '/api/admin/users/:id/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['restore']>>>
    }
  }
  'users.force_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/users/:id/force'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['forceDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/users_controller').default['forceDestroy']>>>
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
  'roles.trash': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/roles/trash'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['trash']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['trash']>>>
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
  'roles.restore': {
    methods: ["POST"]
    pattern: '/api/admin/roles/:id/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['restore']>>>
    }
  }
  'roles.force_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/roles/:id/force'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['forceDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/roles_controller').default['forceDestroy']>>>
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
  'permissions.trash': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/permissions/trash'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['trash']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['trash']>>>
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
  'permissions.restore': {
    methods: ["POST"]
    pattern: '/api/admin/permissions/:id/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['restore']>>>
    }
  }
  'permissions.force_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/permissions/:id/force'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['forceDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/permissions_controller').default['forceDestroy']>>>
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
  'content.new_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/content/new'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['newPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['newPage']>>>
    }
  }
  'content.edit_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/content/:id/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['editPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['editPage']>>>
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
  'content.trash': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/content/trash'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['trash']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['trash']>>>
    }
  }
  'content.check_slug': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/content/check-slug'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['checkSlug']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['checkSlug']>>>
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
  'content.restore': {
    methods: ["POST"]
    pattern: '/api/admin/content/:id/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['restore']>>>
    }
  }
  'content.force_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/content/:id/force'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['forceDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/content_controller').default['forceDestroy']>>>
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
  'pages.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/pages'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['page']>>>
    }
  }
  'pages.edit': {
    methods: ["GET","HEAD"]
    pattern: '/admin/pages/:id/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['edit']>>>
    }
  }
  'pages_public.preview': {
    methods: ["GET","HEAD"]
    pattern: '/admin/pages/:id/preview'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/pages_public_controller').default['preview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/pages_public_controller').default['preview']>>>
    }
  }
  'pages.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/pages'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['index']>>>
    }
  }
  'pages.trash': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/pages/trash'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['trash']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['trash']>>>
    }
  }
  'pages.collections': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/pages/collections'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['collections']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['collections']>>>
    }
  }
  'pages.code_components': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/pages/code-components'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['codeComponents']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['codeComponents']>>>
    }
  }
  'pages.store': {
    methods: ["POST"]
    pattern: '/api/admin/pages'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['store']>>>
    }
  }
  'pages.restore': {
    methods: ["POST"]
    pattern: '/api/admin/pages/:id/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['restore']>>>
    }
  }
  'pages.force_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/pages/:id/force'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['forceDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['forceDestroy']>>>
    }
  }
  'pages.revisions': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/pages/:id/revisions'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['revisions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['revisions']>>>
    }
  }
  'pages.restore_revision': {
    methods: ["POST"]
    pattern: '/api/admin/pages/:id/revisions/:revisionId/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; revisionId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['restoreRevision']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['restoreRevision']>>>
    }
  }
  'pages.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/pages/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['show']>>>
    }
  }
  'pages.update': {
    methods: ["PUT"]
    pattern: '/api/admin/pages/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['update']>>>
    }
  }
  'pages.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/pages/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/pages_controller').default['destroy']>>>
    }
  }
  'templates.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/templates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['page']>>>
    }
  }
  'templates.edit': {
    methods: ["GET","HEAD"]
    pattern: '/admin/templates/:id/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['edit']>>>
    }
  }
  'templates.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/templates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['index']>>>
    }
  }
  'templates.store': {
    methods: ["POST"]
    pattern: '/api/admin/templates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['store']>>>
    }
  }
  'templates.duplicate': {
    methods: ["POST"]
    pattern: '/api/admin/templates/:id/duplicate'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['duplicate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['duplicate']>>>
    }
  }
  'templates.set_default': {
    methods: ["POST"]
    pattern: '/api/admin/templates/:id/default'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['setDefault']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['setDefault']>>>
    }
  }
  'templates.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/templates/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['show']>>>
    }
  }
  'templates.update': {
    methods: ["PUT"]
    pattern: '/api/admin/templates/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['update']>>>
    }
  }
  'templates.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/templates/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/templates_controller').default['destroy']>>>
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
  'cms.collections_trash': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/cms/collections/trash'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsTrash']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsTrash']>>>
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
  'cms.collections_restore': {
    methods: ["POST"]
    pattern: '/api/admin/cms/collections/:key/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsRestore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsRestore']>>>
    }
  }
  'cms.collections_force_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/cms/collections/:key/force'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsForceDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['collectionsForceDestroy']>>>
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
  'cms.components_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/cms/components'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsPage']>>>
    }
  }
  'cms.components_index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/cms/components'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsIndex']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsIndex']>>>
    }
  }
  'cms.components_store': {
    methods: ["POST"]
    pattern: '/api/admin/cms/components'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsStore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsStore']>>>
    }
  }
  'cms.components_update': {
    methods: ["PUT"]
    pattern: '/api/admin/cms/components/:key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsUpdate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsUpdate']>>>
    }
  }
  'cms.components_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/cms/components/:key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['componentsDestroy']>>>
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
  'cms.records_trash': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/cms/:key/records/trash'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsTrash']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsTrash']>>>
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
  'cms.records_restore': {
    methods: ["POST"]
    pattern: '/api/admin/cms/:key/records/:id/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsRestore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsRestore']>>>
    }
  }
  'cms.records_force_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/cms/:key/records/:id/force'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsForceDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/cms_controller').default['recordsForceDestroy']>>>
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
  'media.trash': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/media/trash'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['trash']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['trash']>>>
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
  'media.replace': {
    methods: ["POST"]
    pattern: '/api/admin/media/:id/file'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['replace']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['replace']>>>
    }
  }
  'media.update': {
    methods: ["PATCH"]
    pattern: '/api/admin/media/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['update']>>>
    }
  }
  'media.restore': {
    methods: ["POST"]
    pattern: '/api/admin/media/:id/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['restore']>>>
    }
  }
  'media.force_destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/media/:id/force'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['forceDestroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/media_controller').default['forceDestroy']>>>
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
  'settings.appearance_settings_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/settings/appearance'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['appearanceSettingsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['appearanceSettingsPage']>>>
    }
  }
  'settings.general_settings_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/settings/general'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['generalSettingsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['generalSettingsPage']>>>
    }
  }
  'settings.website_settings_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/website-settings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['websiteSettingsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['websiteSettingsPage']>>>
    }
  }
  'settings.application_settings_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/settings/application'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['applicationSettingsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['applicationSettingsPage']>>>
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
  'mail_settings.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/settings/email'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['page']>>>
    }
  }
  'mail_settings.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/settings/mail'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['show']>>>
    }
  }
  'mail_settings.update': {
    methods: ["PUT"]
    pattern: '/api/admin/settings/mail'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['update']>>>
    }
  }
  'mail_settings.send_test': {
    methods: ["POST"]
    pattern: '/api/admin/settings/mail/test'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['sendTest']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['sendTest']>>>
    }
  }
  'mail_settings.events': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/settings/mail/events'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['events']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['events']>>>
    }
  }
  'mail_settings.update_event': {
    methods: ["PUT"]
    pattern: '/api/admin/settings/mail/events/:key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['updateEvent']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['updateEvent']>>>
    }
  }
  'mail_settings.deliveries': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/settings/mail/deliveries'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['deliveries']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/mail_settings_controller').default['deliveries']>>>
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
  'settings.get_page_code': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/settings/page-code'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['getPageCode']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['getPageCode']>>>
    }
  }
  'settings.update_page_code': {
    methods: ["PUT"]
    pattern: '/api/admin/settings/page-code'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['updatePageCode']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['updatePageCode']>>>
    }
  }
  'settings.api_tokens_page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/settings/api-tokens'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['apiTokensPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['apiTokensPage']>>>
    }
  }
  'api_tokens.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/api-tokens'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/api_tokens_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/api_tokens_controller').default['index']>>>
    }
  }
  'api_tokens.store': {
    methods: ["POST"]
    pattern: '/api/admin/api-tokens'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/api_tokens_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/api_tokens_controller').default['store']>>>
    }
  }
  'api_tokens.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/api-tokens/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/api_tokens_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/api_tokens_controller').default['destroy']>>>
    }
  }
  'health.admin': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/health'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/health_controller').default['admin']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/health_controller').default['admin']>>>
    }
  }
  'schema.pending': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/schema/pending'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/schema_controller').default['pending']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/schema_controller').default['pending']>>>
    }
  }
  'schema.install': {
    methods: ["POST"]
    pattern: '/api/admin/schema/install'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/schema_controller').default['install']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/schema_controller').default['install']>>>
    }
  }
  'schema.uninstall_module': {
    methods: ["POST"]
    pattern: '/api/admin/modules/:name/uninstall'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { name: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/schema_controller').default['uninstallModule']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/schema_controller').default['uninstallModule']>>>
    }
  }
  'module_install.deployment': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/deployment'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['deployment']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['deployment']>>>
    }
  }
  'module_install.detected': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/modules/detected'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['detected']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['detected']>>>
    }
  }
  'module_install.latest': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/module-install-jobs/latest'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['latest']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['latest']>>>
    }
  }
  'module_install.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/module-install-jobs/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['show']>>>
    }
  }
  'module.install': {
    methods: ["POST"]
    pattern: '/api/admin/modules/:name/install'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { name: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['install']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/module_install_controller').default['install']>>>
    }
  }
  'modules.menu': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/modules/menu'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/modules_controller').default['menu']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/modules_controller').default['menu']>>>
    }
  }
  'settings.nav_config': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/nav-config'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['navConfig']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/settings_controller').default['navConfig']>>>
    }
  }
  'modules.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/modules'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/modules_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/modules_controller').default['index']>>>
    }
  }
  'modules.toggle': {
    methods: ["PUT"]
    pattern: '/api/admin/modules/:name/toggle'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { name: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/modules_controller').default['toggle']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/modules_controller').default['toggle']>>>
    }
  }
  'v1.content.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/content'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['index']>>>
    }
  }
  'v1.content.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/content/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['show']>>>
    }
  }
  'v1.content.store': {
    methods: ["POST"]
    pattern: '/api/v1/content'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['store']>>>
    }
  }
  'v1.content.update': {
    methods: ["PUT"]
    pattern: '/api/v1/content/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['update']>>>
    }
  }
  'v1.content.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/content/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/content_controller').default['destroy']>>>
    }
  }
  'v1.cms.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/cms/:key/records'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['index']>>>
    }
  }
  'v1.cms.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/cms/:key/records/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['show']>>>
    }
  }
  'v1.cms.store': {
    methods: ["POST"]
    pattern: '/api/v1/cms/:key/records'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { key: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['store']>>>
    }
  }
  'v1.cms.update': {
    methods: ["PUT"]
    pattern: '/api/v1/cms/:key/records/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['update']>>>
    }
  }
  'v1.cms.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/cms/:key/records/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { key: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/cms_records_controller').default['destroy']>>>
    }
  }
  'admin.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/announcements'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['page']>>>
    }
  }
  'admin.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/announcements'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['index']>>>
    }
  }
  'admin.store': {
    methods: ["POST"]
    pattern: '/api/admin/announcements'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['store']>>>
    }
  }
  'admin.update': {
    methods: ["PUT"]
    pattern: '/api/admin/announcements/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['update']>>>
    }
  }
  'admin.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/announcements/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_controller').default['destroy']>>>
    }
  }
  'public.page': {
    methods: ["GET","HEAD"]
    pattern: '/announcements'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_public_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/announcements/controllers/announcements_public_controller').default['page']>>>
    }
  }
  'ecommerce.webhooks.stripe': {
    methods: ["POST"]
    pattern: '/api/webhooks/stripe'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/webhooks_controller').default['stripe']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/webhooks_controller').default['stripe']>>>
    }
  }
  'ecommerce.webhooks.paypal': {
    methods: ["POST"]
    pattern: '/api/webhooks/paypal'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/webhooks_controller').default['paypal']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/webhooks_controller').default['paypal']>>>
    }
  }
  'shop.products.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['index']>>>
    }
  }
  'shop.products.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/products/:slug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { slug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['show']>>>
    }
  }
  'shop.categories': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/categories'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['categories']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['categories']>>>
    }
  }
  'shop.geo.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/geo/cities'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/geo_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/geo_controller').default['index']>>>
    }
  }
  'shop.geo.cities': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/geo/cities/:code'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { code: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/geo_controller').default['cities']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/geo_controller').default['cities']>>>
    }
  }
  'shop.availability': {
    methods: ["POST"]
    pattern: '/api/shop/availability'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['availability']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['availability']>>>
    }
  }
  'shop.cart.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/cart'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['show']>>>
    }
  }
  'shop.me': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['me']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['me']>>>
    }
  }
  'shop.order.status': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/order'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/checkout_controller').default['status']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/checkout_controller').default['status']>>>
    }
  }
  'shop.cart.add': {
    methods: ["POST"]
    pattern: '/api/shop/cart/items'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['add']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['add']>>>
    }
  }
  'shop.cart.update': {
    methods: ["PUT"]
    pattern: '/api/shop/cart/items'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['update']>>>
    }
  }
  'shop.cart.remove': {
    methods: ["DELETE"]
    pattern: '/api/shop/cart/items/:variantId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { variantId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['destroy']>>>
    }
  }
  'shop.cart.clear': {
    methods: ["DELETE"]
    pattern: '/api/shop/cart'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['clear']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/cart_controller').default['clear']>>>
    }
  }
  'shop.checkout': {
    methods: ["POST"]
    pattern: '/api/shop/checkout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/checkout_controller').default['start']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/checkout_controller').default['start']>>>
    }
  }
  'shop.account.register': {
    methods: ["POST"]
    pattern: '/api/shop/account/register'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['register']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['register']>>>
    }
  }
  'shop.account.login': {
    methods: ["POST"]
    pattern: '/api/shop/account/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['login']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['login']>>>
    }
  }
  'shop.account.logout': {
    methods: ["POST"]
    pattern: '/api/shop/account/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['logout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['logout']>>>
    }
  }
  'shop.account.orders': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/account/orders'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['orders']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['orders']>>>
    }
  }
  'shop.referral': {
    methods: ["GET","HEAD"]
    pattern: '/ref/:code'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { code: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/referral_controller').default['click']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/referral_controller').default['click']>>>
    }
  }
  'shop.currencies': {
    methods: ["GET","HEAD"]
    pattern: '/api/shop/currencies'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['currencies']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['currencies']>>>
    }
  }
  'shop.shipping.options': {
    methods: ["POST"]
    pattern: '/api/shop/shipping/options'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/checkout_controller').default['shippingOptions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/checkout_controller').default['shippingOptions']>>>
    }
  }
  'shop.currency.set': {
    methods: ["POST"]
    pattern: '/api/shop/currency'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['setCurrency']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/catalog_controller').default['setCurrency']>>>
    }
  }
  'shop.discount.check': {
    methods: ["POST"]
    pattern: '/api/shop/discount/check'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/referral_controller').default['checkDiscount']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/referral_controller').default['checkDiscount']>>>
    }
  }
  'shop.front': {
    methods: ["GET","HEAD"]
    pattern: '/shop'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['shopFront']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['shopFront']>>>
    }
  }
  'shop.unsubscribe': {
    methods: ["GET","HEAD"]
    pattern: '/shop/unsubscribe'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['unsubscribe']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/account_controller').default['unsubscribe']>>>
    }
  }
  'shop.account': {
    methods: ["GET","HEAD"]
    pattern: '/shop/account'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['account']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['account']>>>
    }
  }
  'shop.account.page.login': {
    methods: ["GET","HEAD"]
    pattern: '/shop/account/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['accountLogin']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['accountLogin']>>>
    }
  }
  'shop.account.page.register': {
    methods: ["GET","HEAD"]
    pattern: '/shop/account/register'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['accountRegister']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['accountRegister']>>>
    }
  }
  'shop.product': {
    methods: ["GET","HEAD"]
    pattern: '/shop/p/:slug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { slug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['product']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['product']>>>
    }
  }
  'shop.download': {
    methods: ["GET","HEAD"]
    pattern: '/shop/download/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/download_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/download_controller').default['show']>>>
    }
  }
  'shop.page.cart': {
    methods: ["GET","HEAD"]
    pattern: '/shop/cart'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['cart']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['cart']>>>
    }
  }
  'shop.page.checkout': {
    methods: ["GET","HEAD"]
    pattern: '/shop/checkout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['checkout']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['checkout']>>>
    }
  }
  'shop.page.order': {
    methods: ["GET","HEAD"]
    pattern: '/shop/order'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['order']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/storefront/pages_controller').default['order']>>>
    }
  }
  'ecommerce.dashboard.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/dashboard_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/dashboard_controller').default['page']>>>
    }
  }
  'ecommerce.products.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['page']>>>
    }
  }
  'ecommerce.products.categories': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce/products/categories'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['categoriesPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['categoriesPage']>>>
    }
  }
  'ecommerce.products.new': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce/products/new'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['newPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['newPage']>>>
    }
  }
  'ecommerce.products.detail': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce/products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['detailPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['detailPage']>>>
    }
  }
  'ecommerce.orders.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce/orders'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['page']>>>
    }
  }
  'ecommerce.orders.new': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce/orders/new'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['newPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['newPage']>>>
    }
  }
  'ecommerce.orders.detail': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce/orders/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['detailPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['detailPage']>>>
    }
  }
  'ecommerce.customers.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce/customers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/customers_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/customers_controller').default['page']>>>
    }
  }
  'ecommerce.settings.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/ecommerce/settings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['page']>>>
    }
  }
  'ecommerce.api.orders.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/orders'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['index']>>>
    }
  }
  'ecommerce.api.orders.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/orders/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['show']>>>
    }
  }
  'ecommerce.api.orders.status': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/orders/:id/status'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['updateStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['updateStatus']>>>
    }
  }
  'ecommerce.api.orders.cancel': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/orders/:id/cancel'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['cancel']>>>
    }
  }
  'ecommerce.api.orders.ship': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/orders/:id/ship'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['markShipped']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['markShipped']>>>
    }
  }
  'ecommerce.api.orders.note': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/orders/:id/note'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['updateNote']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['updateNote']>>>
    }
  }
  'ecommerce.api.orders.store': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/orders'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['storeManual']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['storeManual']>>>
    }
  }
  'ecommerce.api.sales': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/sales'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/dashboard_controller').default['sales']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/dashboard_controller').default['sales']>>>
    }
  }
  'ecommerce.api.abandonedCarts': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/abandoned-carts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/dashboard_controller').default['abandonedCarts']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/dashboard_controller').default['abandonedCarts']>>>
    }
  }
  'ecommerce.api.currencies.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/currencies'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['currencies']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['currencies']>>>
    }
  }
  'ecommerce.api.shipping.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/shipping'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['shipping']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['shipping']>>>
    }
  }
  'ecommerce.api.storefront.seed': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/storefront/seed'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['seedStorefront']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['seedStorefront']>>>
    }
  }
  'ecommerce.api.shipping.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/shipping'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['updateShipping']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['updateShipping']>>>
    }
  }
  'ecommerce.api.currencies.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/currencies'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['updateCurrencies']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['updateCurrencies']>>>
    }
  }
  'ecommerce.api.customers.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/customers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/customers_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/customers_controller').default['index']>>>
    }
  }
  'ecommerce.api.customers.status': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/customers/:id/status'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/customers_controller').default['updateStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/customers_controller').default['updateStatus']>>>
    }
  }
  'ecommerce.api.exports.orders': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/exports/orders'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/exports_controller').default['orders']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/exports_controller').default['orders']>>>
    }
  }
  'ecommerce.api.exports.orderItems': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/exports/order-items'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/exports_controller').default['orderItems']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/exports_controller').default['orderItems']>>>
    }
  }
  'ecommerce.api.exports.customers': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/exports/customers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/exports_controller').default['customers']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/exports_controller').default['customers']>>>
    }
  }
  'ecommerce.api.exports.products': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/exports/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/exports_controller').default['products']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/exports_controller').default['products']>>>
    }
  }
  'ecommerce.api.grants.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/orders/:orderId/grants'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { orderId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['grants']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['grants']>>>
    }
  }
  'ecommerce.api.grants.revoke': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/grants/:id/revoke'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['revoke']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['revoke']>>>
    }
  }
  'ecommerce.api.orders.refund': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/orders/:id/refund'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['refund']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/orders_controller').default['refund']>>>
    }
  }
  'ecommerce.api.gateways.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/gateways'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/gateways_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/gateways_controller').default['index']>>>
    }
  }
  'ecommerce.api.gateways.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/gateways/:gateway/:mode'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { gateway: ParamValue; mode: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/gateways_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/gateways_controller').default['update']>>>
    }
  }
  'ecommerce.api.gateways.verify': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/gateways/:gateway/:mode/verify'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { gateway: ParamValue; mode: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/gateways_controller').default['verify']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/gateways_controller').default['verify']>>>
    }
  }
  'ecommerce.api.products.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['index']>>>
    }
  }
  'ecommerce.api.products.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['show']>>>
    }
  }
  'ecommerce.api.products.store': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['store']>>>
    }
  }
  'ecommerce.api.products.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['update']>>>
    }
  }
  'ecommerce.api.products.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/ecommerce/products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['destroy']>>>
    }
  }
  'ecommerce.api.variants.store': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/products/:id/variants'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['storeVariant']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['storeVariant']>>>
    }
  }
  'ecommerce.api.variants.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/variants/:variantId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { variantId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['updateVariant']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['updateVariant']>>>
    }
  }
  'ecommerce.api.variants.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/ecommerce/variants/:variantId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { variantId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['destroyVariant']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['destroyVariant']>>>
    }
  }
  'ecommerce.api.assets.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/products/:productId/assets'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { productId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['index']>>>
    }
  }
  'ecommerce.api.assets.store': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/variants/:variantId/assets'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { variantId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['store']>>>
    }
  }
  'ecommerce.api.assets.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/assets/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['update']>>>
    }
  }
  'ecommerce.api.assets.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/ecommerce/assets/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/digital_controller').default['destroy']>>>
    }
  }
  'ecommerce.api.variantPrices.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/variants/:variantId/prices'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { variantId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['variantPrices']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['variantPrices']>>>
    }
  }
  'ecommerce.api.variantPrices.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/variants/:variantId/prices'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { variantId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['updateVariantPrices']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/products_controller').default['updateVariantPrices']>>>
    }
  }
  'ecommerce.api.categories.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/categories'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/categories_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/categories_controller').default['index']>>>
    }
  }
  'ecommerce.api.categories.store': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/categories'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/categories_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/categories_controller').default['store']>>>
    }
  }
  'ecommerce.api.categories.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/categories/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/categories_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/categories_controller').default['update']>>>
    }
  }
  'ecommerce.api.categories.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/ecommerce/categories/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/categories_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/categories_controller').default['destroy']>>>
    }
  }
  'ecommerce.api.settings.show': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/settings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['show']>>>
    }
  }
  'ecommerce.api.settings.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/settings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/settings_controller').default['update']>>>
    }
  }
  'ecommerce.discounts.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/marketing/discounts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['discountsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['discountsPage']>>>
    }
  }
  'ecommerce.affiliates.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/marketing/affiliates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['affiliatesPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['affiliatesPage']>>>
    }
  }
  'ecommerce.commissions.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/marketing/commissions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['commissionsPage']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['commissionsPage']>>>
    }
  }
  'ecommerce.api.discounts.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/discounts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['listDiscounts']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['listDiscounts']>>>
    }
  }
  'ecommerce.api.discounts.store': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/discounts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['createDiscount']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['createDiscount']>>>
    }
  }
  'ecommerce.api.discounts.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/discounts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['updateDiscount']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['updateDiscount']>>>
    }
  }
  'ecommerce.api.discounts.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/ecommerce/discounts/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['destroyDiscount']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['destroyDiscount']>>>
    }
  }
  'ecommerce.api.affiliates.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/affiliates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['listAffiliates']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['listAffiliates']>>>
    }
  }
  'ecommerce.api.affiliates.store': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/affiliates'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['createAffiliate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['createAffiliate']>>>
    }
  }
  'ecommerce.api.affiliates.update': {
    methods: ["PUT"]
    pattern: '/api/admin/ecommerce/affiliates/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['updateAffiliate']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['updateAffiliate']>>>
    }
  }
  'ecommerce.api.commissions.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/commissions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['listCommissions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['listCommissions']>>>
    }
  }
  'ecommerce.api.commissions.pay': {
    methods: ["POST"]
    pattern: '/api/admin/ecommerce/commissions/pay'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['payCommissions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['payCommissions']>>>
    }
  }
  'ecommerce.api.commissions.export': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/commissions/export'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['exportPayouts']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/marketing_controller').default['exportPayouts']>>>
    }
  }
  'ecommerce.api.stats': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/ecommerce/stats'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/dashboard_controller').default['stats']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/ecommerce/controllers/admin/dashboard_controller').default['stats']>>>
    }
  }
  'ctrl.page': {
    methods: ["GET","HEAD"]
    pattern: '/admin/tasks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['page']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['page']>>>
    }
  }
  'ctrl.index': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/tasks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['index']>>>
    }
  }
  'ctrl.assignees': {
    methods: ["GET","HEAD"]
    pattern: '/api/admin/tasks/assignees'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['assignees']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['assignees']>>>
    }
  }
  'ctrl.store': {
    methods: ["POST"]
    pattern: '/api/admin/tasks'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['store']>>>
    }
  }
  'ctrl.move': {
    methods: ["PATCH"]
    pattern: '/api/admin/tasks/:id/move'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['move']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['move']>>>
    }
  }
  'ctrl.update': {
    methods: ["PUT"]
    pattern: '/api/admin/tasks/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['update']>>>
    }
  }
  'ctrl.destroy': {
    methods: ["DELETE"]
    pattern: '/api/admin/tasks/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/tasks/controllers/tasks_controller').default['destroy']>>>
    }
  }
  'pages_public.show': {
    methods: ["GET","HEAD"]
    pattern: '/*'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { '*': ParamValue[] }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/pages_public_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/pages_public_controller').default['show']>>>
    }
  }
}
