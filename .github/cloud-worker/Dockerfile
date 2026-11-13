FROM node:24-bookworm-slim AS node-runtime

FROM ghcr.io/cirruslabs/android-sdk:35@sha256:54e4ef10f19c211052851736dfb783ee26935a089b06bb1f9019a311cdc38af0

COPY --from=node-runtime /usr/local/ /usr/local/

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip \
      build-essential cmake clang ninja-build \
      ffmpeg espeak-ng \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV ANDROID_HOME=/opt/android-sdk-linux
ENV ANDROID_SDK_ROOT=/opt/android-sdk-linux
ENV PATH=/usr/local/bin:/usr/bin:/bin:/opt/android-sdk-linux/cmdline-tools/latest/bin:/opt/android-sdk-linux/platform-tools

WORKDIR /workspace
