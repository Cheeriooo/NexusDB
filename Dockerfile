# NexusDB API — FastAPI + uvicorn
FROM python:3.12-slim AS base

WORKDIR /app

# System deps for numpy/torch wheels to install cleanly
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first so this layer is cached across code changes.
# torch (pulled in by sentence-transformers) defaults to a multi-GB CUDA
# build; this is an API container with no GPU, so pin the CPU-only wheel
# first — cuts the final image from ~9GB down to a few hundred MB.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY pyproject.toml requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY nexusdb ./nexusdb
COPY README.md ./

RUN pip install --no-cache-dir -e . --no-deps

ENV NEXUSDB_AUTO_PERSIST=true \
    NEXUSDB_PERSIST_DIR=/data \
    PYTHONUNBUFFERED=1

VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live', timeout=3)" || exit 1

CMD ["uvicorn", "nexusdb.api.server:app", "--host", "0.0.0.0", "--port", "8000"]
