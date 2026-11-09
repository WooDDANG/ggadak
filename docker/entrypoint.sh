#!/bin/sh
set -eu
chown node:node /data
exec gosu node node /app/docker/supervisor.mjs
