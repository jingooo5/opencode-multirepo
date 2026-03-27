FROM ubuntu:latest

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        ca-certificates \
        curl \
        git \
        jq \
        nodejs \
        npm \
        rsync \
        xz-utils \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ARG USERNAME=tester
ARG USER_UID=10001
ARG USER_GID=10001

RUN groupadd --gid "${USER_GID}" "${USERNAME}" \
    && useradd --uid "${USER_UID}" --gid "${USER_GID}" --create-home --shell /bin/bash "${USERNAME}"

RUN mkdir -p \
    /home/${USERNAME}/.config/opencode \
    /workspace \
    /host-workspace \
    && chown -R ${USERNAME}:${USERNAME} /home/${USERNAME} /workspace /host-workspace

USER ${USERNAME}
WORKDIR /home/${USERNAME}

ENV HOME=/home/${USERNAME}
ENV PATH=${HOME}/.opencode/bin:${PATH}

RUN curl -fsSL https://opencode.ai/install | bash

USER root
RUN ln -sf /home/${USERNAME}/.opencode/bin/opencode /usr/local/bin/opencode

USER ${USERNAME}

WORKDIR /workspace/opencode-multirepo-plugin

CMD ["sleep", "infinity"]
