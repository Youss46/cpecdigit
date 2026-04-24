#!/bin/bash
PORT=8080 pnpm --filter @workspace/api-server run dev &
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/cpec-u run dev
