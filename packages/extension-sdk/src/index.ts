/**
 * @opptrix/extension-sdk — Phase A extension developer SDK.
 *
 * Extension authors import types from this package to write `host` entry modules:
 *
 *   import type { ExtensionHostContext } from '@opptrix/extension-sdk';
 *
 *   export async function activate(ctx: ExtensionHostContext) {
 *     await ctx.storage.set('key', 'value');
 *     ctx.hooks.register('session.messageCommitted', async (payload) => { ... });
 *   }
 *
 * The runtime injects a concrete `ExtensionHostContext` into your `activate()`.
 * This package provides ONLY types — zero runtime footprint in the extension bundle.
 */

export type {
  ExtensionHostContext,
  ExtensionHostApi,
  ExtensionPermission,
  ExtensionManifest,
  ExtensionActivationMode,
  ExtensionContributes,
  StorageApi,
  EventsApi,
  HooksApi,
  RoutesApi,
  PlatformInfo,
  HookPoint,
  RouteHandler,
  RouteRequest,
  RouteResponse,
  RouteMethod,
} from './types.js'

export { ManifestBuilder } from './manifest-builder.js'
