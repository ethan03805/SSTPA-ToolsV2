# SSTPA Tools Backend container image (SRS §5.6)
# 2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.

FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG VERSION=0.1.0-dev
ARG BUILD_NUMBER=0
RUN CGO_ENABLED=0 go build \
    -ldflags "-s -w \
      -X github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/config.Version=${VERSION} \
      -X github.com/netrisk2025/SSTPA-ToolsV2/backend/internal/config.BuildNumber=${BUILD_NUMBER}" \
    -o /out/sstpa-backend ./cmd/sstpa-backend

FROM alpine:3.22
RUN adduser -D -u 10001 sstpa
USER sstpa
COPY --from=build /out/sstpa-backend /usr/local/bin/sstpa-backend
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/sstpa-backend"]
