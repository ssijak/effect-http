import * as Log from "effect-log";

import * as Context from "@effect/data/Context";
import * as Effect from "@effect/io/Effect";
import * as Layer from "@effect/io/Layer";
import * as Logger from "@effect/io/Logger";
import * as S from "@effect/schema/Schema";

import { AnyApi, Api, Endpoint } from "./api";
import { ApiError } from "./errors";
import { EndpointSchemasToInput, SelectEndpointById } from "./internal";
import {
  ValidationErrorFormatter,
  defaultValidationErrorFormatterServer,
} from "./validation-error-formatter";

export type AnyServer = Server<Endpoint[], Handler[]>;

export type Server<
  UnimplementedEndpoints extends Endpoint[] = Endpoint[],
  Handlers extends Handler[] = Handler[],
> = {
  _unimplementedEndpoints: UnimplementedEndpoints;

  handlers: Handlers;
  api: Api;

  logger: Logger.Logger<any, any>;
  validationErrorFormatter: ValidationErrorFormatter;
};

export type Body<Body> = S.Spread<{ body: Body }>;
export type Query<Query> = S.Spread<{ query: Query }>;

export type AnyHandler = Handler<Endpoint, any>;

export type Handler<E extends Endpoint = Endpoint, R = any> = {
  fn: (
    input: EndpointSchemasToInput<E["schemas"]>,
  ) => Effect.Effect<R, ApiError, S.To<E["schemas"]["response"]>>;

  endpoint: E;
};

export type ApiToServer<A extends AnyApi> = A extends Api<infer A>
  ? Server<A, []>
  : never;

/** Create new unimplemeted `Server` from `Api`. */
export const server = <A extends AnyApi>(api: A): ApiToServer<A> =>
  ({
    _unimplementedEndpoints: api.endpoints,
    api,

    handlers: [],
    logger: Log.pretty,
    validationErrorFormatter: defaultValidationErrorFormatterServer,
  } as unknown as ApiToServer<A>);

type DropEndpoint<Es extends Endpoint[], Id extends string> = Es extends [
  infer First,
  ...infer Rest,
]
  ? First extends { id: Id }
    ? Rest
    : [First, ...(Rest extends Endpoint[] ? DropEndpoint<Rest, Id> : never)]
  : [];

type ServerUnimplementedIds<S extends AnyServer> =
  S["_unimplementedEndpoints"][number]["id"];

export const handle =
  <S extends AnyServer, Id extends ServerUnimplementedIds<S>, R>(
    id: Id,
    fn: Handler<SelectEndpointById<S["_unimplementedEndpoints"], Id>, R>["fn"],
  ) =>
  (
    api: S,
  ): Server<
    DropEndpoint<S["_unimplementedEndpoints"], Id>,
    [
      ...S["handlers"],
      Handler<SelectEndpointById<S["_unimplementedEndpoints"], Id>, R>,
    ]
  > => ({
    ...api,
    _unimplementedEndpoints: api._unimplementedEndpoints.filter(
      ({ id: _id }) => _id !== id,
    ) as DropEndpoint<S["_unimplementedEndpoints"], Id>,
    handlers: [
      ...api.handlers,
      {
        fn,
        endpoint: api._unimplementedEndpoints.find(
          ({ id: _id }) => _id === id,
        )!,
      },
    ] as [
      ...S["handlers"],
      Handler<SelectEndpointById<S["_unimplementedEndpoints"], Id>, R>,
    ],
  });

type ProvideLayer<Hs extends Handler[], R0, R> = Hs extends [
  Handler<infer E, infer _R>,
  ...infer Rest,
]
  ? [
      Handler<E, _R extends R ? R0 : _R>,
      ...(Rest extends Handler[] ? ProvideLayer<Rest, R0, R> : never),
    ]
  : [];

export const provideLayer =
  <R0, R>(layer: Layer.Layer<R0, ApiError, R>) =>
  <Es extends Endpoint[], Hs extends Handler[]>(
    api: Server<Es, Hs>,
  ): Server<Es, ProvideLayer<Hs, R0, R>> => ({
    ...api,
    handlers: api.handlers.map((handler) => ({
      ...handler,
      fn: (i: any) => Effect.provideLayer(handler.fn(i), layer),
    })) as ProvideLayer<Hs, R0, R>,
  });

type ProvideService<
  Hs extends Handler[],
  T extends Context.Tag<any, any>,
> = Hs extends [Handler<infer E, infer R>, ...infer Rest]
  ? [
      Handler<E, Exclude<R, Context.Tag.Identifier<T>>>,
      ...(Rest extends Handler[] ? ProvideService<Rest, T> : never),
    ]
  : [];

/** Provide service for all handlers defined so far.
 *
 * Effectively calls `Effect.provideService` on all handler functions.
 **/
export const provideService =
  <T extends Context.Tag<any, any>>(tag: T, service: Context.Tag.Service<T>) =>
  <Es extends Endpoint[], Hs extends Handler[]>(
    api: Server<Es, Hs>,
  ): Server<Es, ProvideService<Hs, T>> => ({
    ...api,
    handlers: api.handlers.map((handler) => ({
      ...handler,
      fn: (i: any) => Effect.provideService(handler.fn(i), tag, service),
    })) as ProvideService<Hs, T>,
  });

export const exhaustive = <S extends Server<[], Handler<any, never>[]>>(
  server: S,
) => server;

/** Set the server logger which will apply for both out-of-box logs and
 * handler logs.
 *
 * You can either provide an instance of `Logger.Logger<I, O>` or
 * use `"default"`, `"pretty"`, `"json"` or `"none"` shorthands.
 *
 * @example
 * const server = pipe(
 *   api,
 *   Http.server,
 *   Http.setLogger("json")
 * );
 *
 * @param logger Logger.Logger<I, O> | "default" | "pretty" | "json" | "none"
 */
export const setLogger =
  <I, O>(
    logger: Logger.Logger<I, O> | "default" | "pretty" | "json" | "none",
  ) =>
  <S extends AnyServer>(server: S): S => {
    return {
      ...server,
      logger:
        logger === "pretty"
          ? Log.pretty
          : logger === "json"
          ? Log.json()
          : logger === "default"
          ? Logger.defaultLogger
          : logger === "none"
          ? Logger.none()
          : logger,
    };
  };

/** Type-helper providing type of a handler input given the type of the
 * Api `A` and operation id `Id`.
 *
 * @example
 * const api = pipe(
 *   Http.api(),
 *   Http.get("getMilan", "/milan", { response: S.string, query: S.string })
 * )
 *
 * type GetMilanInput = Http.Input<typeof api, "getMilan">
 * // -> { query: string }
 *
 * @param A Api type of the API
 * @param Id operation id
 */
export type Input<
  A extends Api,
  Id extends A["endpoints"][number]["id"],
> = EndpointSchemasToInput<
  Extract<A["endpoints"][number], { id: Id }>["schemas"]
>;
