# Matches the engines field and the version CI runs. The image previously sat
# on 20 while CI tested on 24, so the container was never running what the
# pipeline verified.
FROM node:24-alpine

WORKDIR /app

# devDependencies are installed on purpose: the entrypoint runs `npm run dev`,
# which is tsx. compose bind-mounts ./server over /app, so a dist/ built here
# would be shadowed at run time — the container runs TypeScript directly
# instead, and needs no build step.
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4000

ENTRYPOINT ["sh", "docker-entrypoint.sh"]
