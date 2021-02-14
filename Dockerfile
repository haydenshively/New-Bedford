# FROM node AS new-bedford
# WORKDIR /app
# COPY package.json /app/
# RUN npm install
# COPY . /app/
# CMD [ "node", "main.js" ]


FROM ubuntu AS new-bedford-dev
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
  git \
  nano \
  nodejs \
  npm \
  && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/bin/bash"]