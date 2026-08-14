#!/bin/sh
set -e

uvicorn handler:app --host 0.0.0.0 --port 8080 &
uvicorn server:app --host 0.0.0.0 --port 8000 &

wait -n
exit $?