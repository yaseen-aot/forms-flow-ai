#!/bin/bash
# Forms Flow ImmuDB Worker Service Entrypoint

echo "============================================================"
echo "  Starting Forms Flow ImmuDB Worker Service"
echo "============================================================"
echo "  Port: ${PORT:-5001}"
echo "  ImmuDB Host: ${IMMUDB_HOST:-localhost:3322}"
echo "  ImmuDB Enabled: ${IMMUDB_ENABLED:-true}"
echo "============================================================"

# Run with gunicorn for production
gunicorn \
    -b :${PORT:-5001} \
    'src.formsflow_immudb.app:create_app()' \
    --timeout ${GUNICORN_TIMEOUT:-120} \
    --worker-class=gthread \
    --workers=${GUNICORN_WORKERS:-4} \
    --threads=${GUNICORN_THREADS:-10}
