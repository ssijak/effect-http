import { pipe } from "@effect/data/Function";
import * as Effect from "@effect/io/Effect";
import { ParseError } from "@effect/schema/ParseResult";
import * as Schema from "@effect/schema/Schema";

import { Endpoint, IgnoredSchemaId } from "effect-http/Api";

import { validationClientError } from "./ClientError";
import {
  invalidBodyError,
  invalidHeadersError,
  invalidParamsError,
  invalidQueryError,
} from "./ServerError";

/** @internal */
export const getSchema = <A = AnySchema>(
  input: AnySchema | IgnoredSchemaId,
  defaultSchema: AnySchema | A = Schema.unknown,
) => (input == IgnoredSchemaId ? defaultSchema : input);

/** @internal */
export const isArray = (input: unknown): input is readonly any[] =>
  Array.isArray(input);

export type AnySchema = Schema.Schema<any>;
export type SchemaTo<S> = S extends Schema.Schema<any, infer A> ? A : never;

/** @internal */
export const createResponseSchema = (
  responseSchema: Endpoint["schemas"]["response"],
) => {
  if (!isArray(responseSchema)) {
    return responseSchema;
  }

  return Schema.union(
    ...responseSchema.map(({ status, content, headers }) =>
      Schema.struct({
        status: Schema.literal(status),
        content: getSchema(content),
        headers: getSchema(
          headers,
          Schema.record(Schema.string, Schema.string),
        ),
      }),
    ),
  );
};

/** @internal */
const parse = <A, E>(
  a: A,
  encode: (i: unknown) => Effect.Effect<never, ParseError, any>,
  onError: (error: unknown) => E,
) =>
  pipe(
    a === IgnoredSchemaId ? Effect.succeed(a) : encode(a),
    Effect.mapError(onError),
  );

/** @internal */
export const createRequestEncoder = (
  requestSchemas: Endpoint["schemas"]["request"],
) => {
  const encodeQuery = Schema.encode(getSchema(requestSchemas.query));
  const encodeParams = Schema.encode(getSchema(requestSchemas.params));
  const encodeBody = Schema.encode(getSchema(requestSchemas.body));
  const encodeHeaders = Schema.encode(getSchema(requestSchemas.headers));

  return (args: any) =>
    pipe(
      Effect.all({
        query: parse(args["query"], encodeQuery, invalidQueryError),
        params: parse(args["params"], encodeParams, invalidParamsError),
        body: parse(args["body"], encodeBody, invalidBodyError),
        headers: parse(args["headers"], encodeHeaders, invalidHeadersError),
      }),
      Effect.mapError(validationClientError),
    );
};