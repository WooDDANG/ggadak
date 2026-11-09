#!/bin/sh
set -eu
npm run db:migrate --workspace=@ggaddak/be
exec npm run start --workspace=@ggaddak/be
