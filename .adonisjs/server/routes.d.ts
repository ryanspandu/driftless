import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'legacy.signup.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'v1.content.index': { paramsTuple?: []; params?: {} }
    'v1.content.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.content.store': { paramsTuple?: []; params?: {} }
    'v1.content.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.content.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.index': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'v1.cms.show': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'v1.cms.store': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'v1.cms.update': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'v1.cms.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.page': { paramsTuple?: []; params?: {} }
    'admin.index': { paramsTuple?: []; params?: {} }
    'admin.store': { paramsTuple?: []; params?: {} }
    'admin.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'admin.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'public.page': { paramsTuple?: []; params?: {} }
    'ctrl.page': { paramsTuple?: []; params?: {} }
    'ctrl.index': { paramsTuple?: []; params?: {} }
    'ctrl.store': { paramsTuple?: []; params?: {} }
    'ctrl.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ctrl.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  GET: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'v1.content.index': { paramsTuple?: []; params?: {} }
    'v1.content.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.index': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'v1.cms.show': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.page': { paramsTuple?: []; params?: {} }
    'admin.index': { paramsTuple?: []; params?: {} }
    'public.page': { paramsTuple?: []; params?: {} }
    'ctrl.page': { paramsTuple?: []; params?: {} }
    'ctrl.index': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'v1.content.index': { paramsTuple?: []; params?: {} }
    'v1.content.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.index': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'v1.cms.show': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.page': { paramsTuple?: []; params?: {} }
    'admin.index': { paramsTuple?: []; params?: {} }
    'public.page': { paramsTuple?: []; params?: {} }
    'ctrl.page': { paramsTuple?: []; params?: {} }
    'ctrl.index': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'legacy.signup.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'v1.content.store': { paramsTuple?: []; params?: {} }
    'v1.cms.store': { paramsTuple: [ParamValue]; params: {'key': ParamValue} }
    'admin.store': { paramsTuple?: []; params?: {} }
    'ctrl.store': { paramsTuple?: []; params?: {} }
  }
  PUT: {
    'v1.content.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.update': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ctrl.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'v1.content.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'v1.cms.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'key': ParamValue,'id': ParamValue} }
    'admin.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'ctrl.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PATCH: {
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}