#!/bin/sh

# If SERVICE_TYPE is "jwks", run only the JWKS server
if [ "$SERVICE_TYPE" = "jwks" ]; then
    echo "Starting JWKS Server on port ${JWKS_PORT:-8003}..."
    exec python jwks_server.py
# If SERVICE_TYPE is "connector", run only the EHR Connector API
elif [ "$SERVICE_TYPE" = "connector" ]; then
    echo "Starting EHR Connector API on port ${PORT:-8002}..."
    exec python -m src.main
# Otherwise (default), run both
else
    echo "Starting both JWKS Server and EHR Connector API..."
    python jwks_server.py &
    exec python -m src.main
fi
