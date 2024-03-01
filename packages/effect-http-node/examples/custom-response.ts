import { NodeRuntime } from "@effect/platform-node"
import { Schema } from "@effect/schema"
import { Effect, pipe } from "effect"
import { Api, RouterBuilder } from "effect-http"

import { NodeServer } from "effect-http-node"
import { debugLogger } from "./_utils.js"

const api = pipe(
  Api.api(),
  Api.get("hello", "/hello", {
    response: {
      status: 201,
      headers: Schema.struct({
        "X-Hello-World": Schema.string
      }),
      content: Schema.number
    }
  })
)

const app = pipe(
  RouterBuilder.make(api),
  RouterBuilder.handle("hello", () =>
    Effect.succeed({
      content: 12,
      headers: { "x-hello-world": "test" },
      status: 201 as const
    })),
  RouterBuilder.build
)

pipe(
  app,
  NodeServer.listen({ port: 3000 }),
  Effect.provide(debugLogger),
  NodeRuntime.runMain
)