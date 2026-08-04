# Container image for the Spendifico API, deployed to Fly.io.
#
# The build context is THIS directory, not the repo root. backend/ is a
# self-contained npm project with its own package-lock.json, and nothing in the
# image needs frontend/ or the root tooling - so every path below is relative to
# backend/ and `fly deploy` runs from here, like every other command in this app.
#
# Debian slim, never Alpine: the @tursodatabase/* prebuilds target
# linux-x64-gnu and Alpine is musl, so the mismatch would surface as a
# missing-binding crash at startup rather than as a build failure. The tag
# tracks .nvmrc; engines only floors at 22.12, so nothing else pins it here.

FROM node:26-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . ./
# `nest build` also runs the @nestjs/swagger CLI plugin, which is what bakes the
# response metadata into dist/. It needs devDependencies, hence a separate stage.
RUN npm run build

FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install a fresh production tree rather than copying node_modules across, so npm
# resolves the native @tursodatabase bindings for this exact image instead of
# trusting a copy to survive. --omit=dev is safe but narrowly so: @nestjs/swagger
# is a runtime dependency because the metadata emitted above imports it, so
# moving it to devDependencies would break `node dist/main`, not just the docs.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Load-bearing, and the one line here that fails quietly if forgotten.
# CENTRAL_MIGRATIONS_DIR and USER_MIGRATIONS_DIR are join(process.cwd(),
# 'drizzle', ...), and WORKDIR makes /app the cwd, so the SQL has to land at
# /app/drizzle. `nest build` emits only JavaScript and leaves the migrations
# behind, so an image without this boots fine and throws on the first migration
# instead - at central open, or on a new user's first authenticated request.
COPY --from=builder /app/drizzle ./drizzle

# Documentation only; Fly routes to fly.toml's internal_port. Keep the three in
# step: this, internal_port, and PORT in fly.toml's [env].
EXPOSE 3000

# Not `npm start`, which is `nest start` and needs the Nest CLI from
# devDependencies. This matches the start:prod script.
CMD ["node", "dist/main"]
