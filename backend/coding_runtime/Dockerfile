FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        git \
        python3 \
    && rm -rf /var/lib/apt/lists/*

RUN git config --system init.defaultBranch main \
    && git config --system core.autocrlf false

USER 1000:1000
WORKDIR /workspace

CMD ["sleep", "infinity"]
