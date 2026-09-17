# syntax=docker/dockerfile:1

FROM rust:1.86.0 AS builder
WORKDIR /usr/src/app

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/usr/src/app/target,sharing=locked \
    cargo build --release \
    && cp /usr/src/app/target/release/rust-pubsub-server /usr/local/bin/rust-pubsub-server

FROM debian:bookworm-slim
WORKDIR /usr/src/app
COPY --from=builder /usr/local/bin/rust-pubsub-server ./
EXPOSE 8080
CMD ["./rust-pubsub-server"]
