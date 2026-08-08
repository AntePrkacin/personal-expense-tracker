/**
 * Shape of the `GET /api/health` response.
 *
 * A class, not an interface, and in a file whose name ends in `.dto.ts`. Both
 * are load-bearing for the generated OpenAPI spec: an interface erases at
 * compile time, so there would be no runtime object to hang schema metadata
 * on, and `@nestjs/swagger`'s CLI plugin only introspects files matching its
 * `dtoFileNameSuffix` option, which defaults to `['.dto.ts', '.entity.ts']`.
 * Get either wrong and the spec still generates - it just describes this
 * response as an empty object.
 */
export class HealthResponseDto {
  status!: string;
}
