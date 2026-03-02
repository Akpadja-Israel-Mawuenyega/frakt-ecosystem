# worker/Dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install essentials
RUN pip install --no-cache-dir fastapi uvicorn pydantic

# Copy code
COPY . /app/worker/
ENV PYTHONPATH=/app

# Create the directory AND ensure it's writable
RUN mkdir -p /tmp/sockets && chmod 777 /tmp/sockets

# Start Uvicorn
CMD ["uvicorn", "worker.worker:app", "--uds", "/tmp/sockets/worker.sock", "--log-level", "info"]