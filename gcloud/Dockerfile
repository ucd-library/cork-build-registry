FROM debian:bookworm

ENV NODE_VERSION=22

RUN apt update && apt install -y \
    vim \
    apt-transport-https \
    ca-certificates \
    lsb-release \
    git \
    gnupg \
    curl \
    python3

RUN ln -s /usr/bin/python3 /usr/bin/python

RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x -o nodesource_setup.sh \
    && bash nodesource_setup.sh \
    && apt-get install -y nodejs \
    && rm nodesource_setup.sh
RUN npm install -g @ucd-lib/cork-kube

RUN curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

RUN curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
RUN echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /' | tee /etc/apt/sources.list.d/kubernetes.list

RUN apt-get update && \
    apt-get install -y \
    google-cloud-cli \
    kubectl \
    google-cloud-sdk-gke-gcloud-auth-plugin