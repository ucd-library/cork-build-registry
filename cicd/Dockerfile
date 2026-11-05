FROM us-west1-docker.pkg.dev/digital-ucdavis-edu/pub/cork-build-n-deploy:main

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY bin bin
COPY lib lib

ENTRYPOINT ["node", "bin/cork-build-nightly.js"]
CMD ["--exec"]
